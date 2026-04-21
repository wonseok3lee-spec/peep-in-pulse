"""Fetch news via yfinance, filter last 24h UTC, retry on failure, cache last result."""
from __future__ import annotations

import asyncio
import gc
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any

import feedparser
import httpx
import yfinance as yf
from bs4 import BeautifulSoup

from config import TICKERS
from utils import unix_to_utc, utc_to_hhmm, within_last_hours

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
# Keep news ≤3 days old. Covers Friday-evening news surviving the weekend
# skip through to Monday morning. Applies to Google News and Finviz; Yahoo
# has its own stricter 24h cap at line 317.
NEWS_MAX_AGE_DAYS = 3
RETRY_BACKOFF_SECONDS = 1.0

# Article content fetch parameters. 3 s per URL + 8 parallel workers keeps
# the per-ticker tail bounded: 15 articles / 8 workers ≈ 2 waves × 3 s ≈ 6 s
# worst case, instead of 15 s with the previous 5 s × 5 workers.
ARTICLE_TIMEOUT_SECONDS = 3.0
ARTICLE_MAX_CHARS = 2000
ARTICLE_FETCH_WORKERS = 8
ARTICLE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "text/html",
}
# Class-substring candidates for common article body containers.
_CONTENT_DIV_CLASS_NEEDLES = ("article-body", "story-body", "post-body", "content")

# In-memory cache of the last successful fetch per ticker.
# Keyed by ticker symbol, value is the list of filtered news items.
_last_successful_cache: dict[str, list[dict[str, Any]]] = {}


def _extract_item_fields(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize a yfinance news item to {title, published_utc, url}.

    yfinance has shipped two shapes over time:
      - Legacy: {'title': ..., 'providerPublishTime': <unix>, 'link': <url>}
      - Current: {'content': {'title': ..., 'pubDate': '<ISO>',
                              'canonicalUrl': {'url': <url>},
                              'clickThroughUrl': {'url': <url>}}}
    Return None if the item cannot be parsed.
    """
    title: str | None = None
    published: datetime | None = None
    url: str | None = None

    # Legacy flat shape
    if "title" in raw and raw.get("title"):
        title = raw.get("title")
    ts = raw.get("providerPublishTime")
    if ts is not None:
        try:
            published = unix_to_utc(float(ts))
        except (TypeError, ValueError):
            published = None
    if raw.get("link"):
        url = raw.get("link")

    # Newer nested shape
    content = raw.get("content") if isinstance(raw.get("content"), dict) else None
    if content:
        if not title:
            title = content.get("title")
        if published is None:
            pub_date = content.get("pubDate") or content.get("displayTime")
            if pub_date:
                try:
                    # Python's fromisoformat handles '+00:00'; normalize trailing 'Z'.
                    iso = pub_date.replace("Z", "+00:00")
                    published = datetime.fromisoformat(iso)
                    if published.tzinfo is None:
                        published = published.replace(tzinfo=timezone.utc)
                except ValueError:
                    published = None
        if not url:
            for key in ("canonicalUrl", "clickThroughUrl"):
                ref = content.get(key)
                if isinstance(ref, dict) and ref.get("url"):
                    url = ref["url"]
                    break

    if not title or published is None:
        return None

    return {"title": title, "published_utc": published, "url": url}


def fetch_article_summary(url: str | None) -> str | None:
    """Fetch article HTML and extract body text (first 2000 chars), or None on failure.

    Preference order for body text:
      1. <article> tag
      2. <div> with class containing "article-body", "story-body", "post-body", "content"
      3. All <p> tags joined
    """
    if not url:
        return None
    try:
        with httpx.Client(
            timeout=ARTICLE_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            r = client.get(url, headers=ARTICLE_HEADERS)
        if r.status_code >= 400:
            return None
        html = r.text
    except Exception as exc:
        logger.info("[article] fetch failed for %s: %s", url, type(exc).__name__)
        return None

    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")

    def _txt(node) -> str | None:
        if node is None:
            return None
        t = node.get_text(separator=" ", strip=True)
        return t or None

    # 1) Prefer <article>
    text = _txt(soup.find("article"))

    # 2) Common content divs by class substring
    if not text:
        for needle in _CONTENT_DIV_CLASS_NEEDLES:
            node = soup.find(
                lambda tag: tag.name == "div"
                and needle in " ".join(tag.get("class") or []).lower()
            )
            found = _txt(node)
            if found:
                text = found
                break

    # 3) Fall back to all <p>
    if not text:
        paragraphs = [_txt(p) for p in soup.find_all("p")]
        text = " ".join(p for p in paragraphs if p) or None

    if not text:
        return None
    return text[:ARTICLE_MAX_CHARS]


def fetch_google_news(ticker: str) -> list[dict[str, Any]]:
    """Fetch from Google News RSS — no API key needed.

    Sync (not async) so it composes with the sync scheduler thread AND the
    async-lifespan prime without asyncio.run()-inside-running-loop issues.
    feedparser itself is blocking, so async would be cosmetic anyway.
    """
    import calendar

    url = (
        f"https://news.google.com/rss/search?q={ticker}+stock"
        f"&hl=en-US&gl=US&ceid=US:en"
    )
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=NEWS_MAX_AGE_DAYS)
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:12]:
            title = entry.get("title", "").strip()
            # Google News RSS appends " - <Source Name>" to every title;
            # strip it for dedup and display.
            if " - " in title:
                title = title.rsplit(" - ", 1)[0].strip()
            if not title or title in seen:
                continue
            seen.add(title)

            published = None
            if (
                getattr(entry, "published_parsed", None)
                and entry.published_parsed
            ):
                published = datetime.fromtimestamp(
                    calendar.timegm(entry.published_parsed), tz=timezone.utc
                )

            if published and published < cutoff:
                continue

            items.append(
                {
                    "headline": title,
                    "url": entry.get("link", ""),
                    "published_time": published,
                    "source": "google_news",
                }
            )
    except Exception as exc:
        logger.warning("[news] Google News failed for %s: %s", ticker, exc)
    return items


def fetch_finviz_news(ticker: str) -> list[dict[str, Any]]:
    """Scrape Finviz news table — no API key needed."""
    url = f"https://finviz.com/quote.ashx?t={ticker}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://finviz.com/",
    }
    items: list[dict[str, Any]] = []
    try:
        with httpx.Client(timeout=10, headers=headers) as client:
            r = client.get(url)
        if r.status_code != 200:
            logger.warning(
                "[news] Finviz returned %d for %s", r.status_code, ticker
            )
            return []

        try:
            soup = BeautifulSoup(r.text, "lxml")
        except Exception:
            soup = BeautifulSoup(r.text, "html.parser")
        table = soup.find("table", {"id": "news-table"})
        if not table:
            return []

        last_date: datetime | None = None
        today = datetime.now(tz=timezone.utc)

        for row in table.find_all("tr")[:15]:
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            date_str = cells[0].text.strip()
            a_tag = cells[1].find("a")
            if not a_tag:
                continue
            headline = a_tag.get_text(strip=True)
            link = a_tag.get("href", "")

            # Finviz dates: "Apr-13-26 08:30AM" (full) or just "08:30AM"
            # (same day as the row above).
            published: datetime | None = None
            try:
                parts = date_str.split()
                if len(parts) == 2:
                    last_date = datetime.strptime(parts[0], "%b-%d-%y").replace(
                        tzinfo=timezone.utc
                    )
                    time_obj = datetime.strptime(parts[1], "%I:%M%p").time()
                    published = last_date.replace(
                        hour=time_obj.hour, minute=time_obj.minute
                    )
                elif len(parts) == 1 and last_date:
                    time_obj = datetime.strptime(parts[0], "%I:%M%p").time()
                    published = last_date.replace(
                        hour=time_obj.hour, minute=time_obj.minute
                    )
                else:
                    published = today
            except Exception:
                published = today

            if published and (today - published).days > NEWS_MAX_AGE_DAYS:
                continue

            items.append(
                {
                    "headline": headline,
                    "url": link,
                    "published_time": published,
                    "source": "finviz",
                }
            )
    except Exception as exc:
        logger.warning("[news] Finviz failed for %s: %s", ticker, exc)
    return items


def _fetch_articles_for_items(items: list[dict[str, Any]]) -> None:
    """In-place: attach `article_text` to each item by concurrently fetching URLs.

    Uses a thread pool (max 5) with per-request 5s timeout enforced by httpx.
    If any fetch fails / times out, that item gets `article_text = None` and
    the rest of the batch proceeds.
    """
    urls = [it.get("url") for it in items]
    if not any(urls):
        for it in items:
            it["article_text"] = None
        return

    with ThreadPoolExecutor(max_workers=ARTICLE_FETCH_WORKERS) as pool:
        results = list(pool.map(fetch_article_summary, urls))
    for it, text in zip(items, results):
        it["article_text"] = text


def _fetch_yahoo_news(ticker: str) -> list[dict[str, Any]]:
    """Yahoo Finance via yfinance — filtered to last 24h."""
    tkr = yf.Ticker(ticker)
    raw_news = tkr.news or []
    out: list[dict[str, Any]] = []
    for raw in raw_news:
        parsed = _extract_item_fields(raw)
        if parsed is None:
            continue
        if not within_last_hours(parsed["published_utc"], hours=24.0):
            continue
        # Translate to the merged-shape used by Google News / Finviz.
        out.append(
            {
                "headline": parsed["title"],
                "url": parsed.get("url") or "",
                "published_time": parsed["published_utc"],
                "source": "yahoo",
            }
        )
    return out


async def _fetch_ticker_news_once_async(ticker: str) -> list[dict[str, Any]]:
    """One fetch attempt merging Yahoo + Google News + Finviz.

    Yahoo and Google always fetch in parallel (both reliable and cheap).
    Finviz only fires when Yahoo returned <5 items — Finviz's BeautifulSoup
    DOM is the heaviest per-ticker allocation (~1-2 MB) and at 10+ merged
    results its contribution is usually deduped away anyway.
    """
    loop = asyncio.get_running_loop()

    yahoo_result, google_result = await asyncio.gather(
        loop.run_in_executor(None, _fetch_yahoo_news, ticker),
        loop.run_in_executor(None, fetch_google_news, ticker),
        return_exceptions=True,
    )

    yahoo_items: list[dict[str, Any]] = []
    google_items: list[dict[str, Any]] = []
    finviz_items: list[dict[str, Any]] = []

    if isinstance(yahoo_result, Exception):
        logger.warning(
            "[news] Yahoo Finance failed for %s: %s", ticker, yahoo_result
        )
    else:
        yahoo_items = yahoo_result or []
        logger.info(
            "[news] %s: +%d from Yahoo Finance", ticker, len(yahoo_items)
        )

    if isinstance(google_result, Exception):
        logger.warning(
            "[news] Google News failed for %s: %s", ticker, google_result
        )
    else:
        google_items = google_result or []
        logger.info("[news] %s: +%d from Google News", ticker, len(google_items))

    # Conditional Finviz: only worth the DOM allocation when Yahoo was thin.
    if len(yahoo_items) < 5:
        try:
            finviz_result = await loop.run_in_executor(
                None, fetch_finviz_news, ticker
            )
            finviz_items = finviz_result or []
            logger.info(
                "[news] %s: +%d from Finviz", ticker, len(finviz_items)
            )
        except Exception as exc:
            logger.warning("[news] Finviz failed for %s: %s", ticker, exc)
    else:
        logger.info(
            "[news] %s: skipping Finviz (Yahoo returned %d ≥ 5)",
            ticker,
            len(yahoo_items),
        )

    # Merge all sources
    all_items = yahoo_items + google_items + finviz_items

    # Final safety filter: drop anything older than the cutoff, OR with no
    # published time at all (we can't render "Unknown date" to the user).
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=NEWS_MAX_AGE_DAYS)
    all_items = [
        it
        for it in all_items
        if it.get("published_time") and it["published_time"] >= cutoff
    ]

    # Dedup by first 6 words of lowercased headline.
    seen_keys: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in all_items:
        key = " ".join(item["headline"].lower().split()[:6])
        if key and key not in seen_keys:
            seen_keys.add(key)
            deduped.append(item)

    # Sort by recency, keep top 20. Larger pool lets the frontend's
    # Recency-vs-Importance toggle produce visibly different orderings —
    # without it, breaking news is both the most recent AND the most
    # important, so the two modes collapse to the same list. Frontend
    # still caps the visible slice at 7 internal + 5 external.
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    deduped.sort(key=lambda x: x.get("published_time") or epoch, reverse=True)
    all_items = deduped[:20]

    logger.info(
        "[news] %s: %d total after dedup — yahoo=%d, google=%d, finviz=%d",
        ticker,
        len(all_items),
        len(yahoo_items),
        len(google_items),
        len(finviz_items),
    )

    # Translate back to the canonical internal shape downstream expects
    # (tag_all reads `title` and `published_utc`).
    items = [
        {
            "title": it["headline"],
            "published_utc": it.get("published_time"),
            "url": it.get("url") or "",
            "source": it.get("source"),
        }
        for it in all_items
    ]

    # Article-body enrichment (ThreadPoolExecutor internally). Offload via
    # run_in_executor so this task doesn't block the event loop while other
    # tickers' enrichment is in flight.
    await loop.run_in_executor(None, _fetch_articles_for_items, items)
    # Release transient BeautifulSoup trees held by the enricher's worker
    # frames before the next ticker's enrichment starts stacking more.
    gc.collect()
    got = sum(1 for it in items if it.get("article_text"))
    logger.info(
        "[news] %s: final %d items, %d with article text",
        ticker,
        len(items),
        got,
    )
    return items


async def fetch_ticker_news_async(ticker: str) -> list[dict[str, Any]]:
    """Async version of fetch_ticker_news with 3-retry linear backoff.

    Never raises — on total failure, returns the last cached successful
    result, or [] if the ticker was never fetched successfully.
    """
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            items = await _fetch_ticker_news_once_async(ticker)
            _last_successful_cache[ticker] = items
            return items
        except Exception as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF_SECONDS * attempt)

    if ticker in _last_successful_cache:
        return _last_successful_cache[ticker]
    if last_error is not None:
        print(
            f"[warn] {ticker}: fetch failed after {MAX_RETRIES} retries ({last_error})"
        )
    return []


async def fetch_all_async(
    tickers: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Parallel fetch across every ticker; returns {ticker: [items]}."""
    if tickers is None:
        tickers = TICKERS
    results = await asyncio.gather(
        *(fetch_ticker_news_async(t) for t in tickers),
        return_exceptions=True,
    )
    out: dict[str, list[dict[str, Any]]] = {}
    for ticker, result in zip(tickers, results):
        if isinstance(result, Exception):
            logger.warning(
                "[news] fetch_ticker_news failed for %s: %s", ticker, result
            )
            out[ticker] = _last_successful_cache.get(ticker, [])
        else:
            out[ticker] = result
    return out


def fetch_ticker_news(ticker: str) -> list[dict[str, Any]]:
    """Sync wrapper. Safe to call from non-async contexts only (scheduler
    threads, `run_in_executor` workers); from an async context, use
    `fetch_ticker_news_async` directly.
    """
    return asyncio.run(fetch_ticker_news_async(ticker))


def fetch_all(tickers: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """Sync wrapper around fetch_all_async. Same constraint: sync contexts only."""
    return asyncio.run(fetch_all_async(tickers))


def _print_pulse_scan(results: dict[str, list[dict[str, Any]]]) -> None:
    for ticker, items in results.items():
        print(f"--- Peeping into {ticker} ---")
        if not items:
            print("(no headlines in the last 24h)")
            continue
        for item in items:
            print(f"[{utc_to_hhmm(item['published_utc'])}] {item['title']}")
    print("--- Pulse Scan Complete ---")


if __name__ == "__main__":
    results = fetch_all()
    _print_pulse_scan(results)
