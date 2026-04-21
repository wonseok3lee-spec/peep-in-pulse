"""Tag news headlines via GPT-4o-mini (batched per ticker) and print top 3 per ticker."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any

from openai import OpenAI

from config import OPENAI_API_KEY
from news_fetcher import fetch_all

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """You are a stock news tagger for day traders.
You will receive JSON with {"ticker": "<SYMBOL>", "items": [{"id": 0, "headline": "...", "article_text": "..." or null}, ...]}.

CRITICAL: Each input item has an 'id' field. Your output array MUST contain the same 'id' in each result object. Return results in the SAME ORDER as input, with matching ids. Never omit the id field. Never put importance values like 'medium' or 'high' in the quadrant field.

Your job is to extract the KEY FACT from each article — not restate the headline — and express it TWO ways: one short pill and one full sentence.

=== short_headline — MAX 4 WORDS ===
- Extremely punchy. Grammar can be broken.
- Format: [TICKER_SUBJECT] [ACTION_OR_NUMBER].
- Prefer tickers, numbers, +/- symbols over words.
- No articles (a, the). No prepositions when avoidable.
Examples:
- 'Microsoft dip warning issued by analysts'      → 'MSFT dip warning'
- 'Netflix -9.7% on guidance miss'                → 'NFLX -9.7%'
- 'Oracle integrates with AWS cloud services'     → 'ORCL + AWS'
- 'Cramer talks Lumen Technologies'               → 'Cramer: Lumen +'
- 'Nadella leads Copilot overhaul'                → 'Nadella: Copilot'
BAD: 'Cramer on Lumen Technologies' (will get truncated in UI)
GOOD: 'Cramer: Lumen +' (fits easily)

=== full_headline — max 12 words ===
- Full sentence: subject + action + result.
- Include specific numbers, names, percentages when available.
Examples:
- BAD: 'Netflix falls after guidance'
  GOOD: 'Netflix missed Q1 guidance, stock dropped 9.7%'
- GOOD: 'Oracle signed $1.5B cloud deal with Saudi Aramco'
- GOOD: 'Azure revenue grew 21% YoY, beating analyst estimates'

If no article_text is provided (null), derive both fields from the input headline — compress it for short_headline and keep/expand it for full_headline using whatever context you can infer.

Return a JSON array only — no explanation. One object per input item, same order, matching ids:
[
  {
    "id": 0,
    "short_headline": "KEY FACT (max 4 words, punchy)",
    "full_headline": "Full sentence with context (max 12 words)",
    "summary": "One-sentence insight (max 15 words) — what this means for the stock",
    "importance": "high" or "medium",
    "surprise": true or false,
    "reason": "MAX 5 WORDS — why this matters (legacy, keep short)",
    "quadrant": "internal" or "external",
    "relevance": "primary" or "passing" or "off_topic"
  }
]

Rules:
- high = could move the ticker's stock price significantly today
- medium = notable but likely already priced in
- surprise = true only if sudden, unexpected, unscheduled
- surprise = false if routine or scheduled
- Regular quarterly earnings = surprise is false UNLESS guidance is significantly shocking
- If the headline is primarily about a different company than the given ticker, set importance = "medium" AND surprise = false

=== summary — MAX 15 WORDS ===
A single-sentence insight explaining what this news means for the stock.
Reader should understand the story without clicking through. No article links.
No "this article discusses..." meta-talk. Just the substance.
Examples:
- 'Institutional shorts piled in after Q3 miss, hedge funds expect further downside.'
- 'New AI model announcement signals renewed growth narrative for cloud segment.'
- 'CEO departure ends a decade of strategic consistency, successor unknown.'

=== reason — MAX 5 WORDS (legacy) ===
Plain English "why it matters" for the stock. No complete sentences. No articles.
Examples:
- 'Signals potential short squeeze setup'
- 'Earnings beat drives upside'
- 'Leadership change impacts strategy'
- 'Routine market commentary' (for 🟡 items)
- 'Macro risk affects sector'

=== QUADRANT RULES (be strict) ===
quadrant MUST be exactly one of: 'internal' or 'external'
Do NOT put importance values like "medium" or "high" in the quadrant field. Do NOT invent new values.

- internal: This news is primarily ABOUT the given ticker specifically.
  Examples: earnings results, CEO change, product launch, company deal, stock analyst rating.
- external: This news is about the broader market, economy, competitors, or regulations.
  Examples: Fed rates, sector trends, competitor news, geopolitical events, market rally.

When the headline is primarily about a different company (not the given ticker), use 'external'.

=== RELEVANCE RULES (be strict) ===
relevance MUST be exactly one of: 'primary' | 'passing' | 'off_topic'
- primary: The given ticker is a main subject of the article. Include in feed.
- passing: The given ticker is mentioned but the article is mostly about something else (sector, peer, market). Still include, but in external quadrant.
- off_topic: The given ticker is barely related — mentioned only in a list, ticker symbol appears but article is about a different company entirely, or the article admits no impact on the ticker. DROP from feed.

When relevance = off_topic, the item will be dropped before reaching the user. Be willing to mark items as off_topic — quality over quantity.

EXAMPLES of off_topic (would be dropped):
- ticker=ORCL, headline='Snap announced major layoffs cutting 1,000 jobs'
  → relevance: 'off_topic' (article is entirely about Snap, not Oracle)
- ticker=TSLA, headline="Apple's stock performance under Tim Cook analyzed"
  → relevance: 'off_topic' (article is about Apple, not Tesla)
- ticker=MSFT, summary='No direct impact on Microsoft expected'
  → relevance: 'off_topic' (model itself admits no impact)

EXAMPLES of passing (kept, external):
- ticker=ORCL, headline='10 software stocks moving today'
  → relevance: 'passing' (Oracle is one of many in a list)
- ticker=TSLA, headline='EV sector faces tariff pressure'
  → relevance: 'passing' (sector news, indirectly affects Tesla)

EXAMPLES of primary (kept, internal or external based on quadrant rules):
- ticker=ORCL, headline='A legendary value fund just bet big on Oracle'
  → relevance: 'primary', quadrant: 'internal' (direct Oracle news)
- ticker=NKTR, headline='NKTR stock surged 18% after data release'
  → relevance: 'primary', quadrant: 'internal'"""

VALID_QUADRANTS: frozenset[str] = frozenset({"internal", "external"})
# Safer fallback than "internal": when the model slips (e.g. outputs "medium"
# into the quadrant field, which we've seen empirically), promoting unrelated
# news to "company-specific" is worse than bucketing it as external market news.
DEFAULT_QUADRANT = "external"

VALID_RELEVANCE: frozenset[str] = frozenset({"primary", "passing", "off_topic"})
# On invalid/missing relevance, default to "passing" rather than "off_topic" —
# we'd rather show a borderline item than silently drop one due to a model slip.
DEFAULT_RELEVANCE = "passing"

# Lower rank = higher priority when selecting the top 3.
TAG_PRIORITY: dict[str, int] = {
    "🔴⚡": 0,
    "🔴": 1,
    "🟡⚡": 2,
    "🟡": 3,
}


def _display_tag(importance: str, surprise: bool) -> str:
    """Map (importance, surprise) → emoji tag."""
    if importance == "high" and surprise:
        return "🔴⚡"
    if importance == "high":
        return "🔴"
    if importance == "medium" and surprise:
        return "🟡⚡"
    return "🟡"


def _strip_code_fences(text: str) -> str:
    """Remove ```json ... ``` fences if the model wrapped the array."""
    text = text.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


ARTICLE_EXCERPT_CHARS = 1500


def _fallback_batch(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Neutral fallback returned when the model response can't be parsed.

    Uses each item's original title for both headline fields so the UI still
    has something to show rather than an empty field.
    """
    return [
        {
            "short_headline": it.get("title", "") or "",
            "full_headline": it.get("title", "") or "",
            "summary": it.get("title", "") or "",
            "importance": "medium",
            "surprise": False,
            "reason": "parse error",
            "quadrant": DEFAULT_QUADRANT,
            "relevance": "passing",
        }
        for it in items
    ]


def _call_tagger(
    client: OpenAI, ticker: str, items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """One batched GPT-4o-mini call for all items of a ticker. Returns aligned tag list.

    Each input item must carry {title, article_text (or None)}. Article excerpts
    are trimmed to ARTICLE_EXCERPT_CHARS so token usage stays bounded.

    Never raises on parse errors: logs the raw response and returns a neutral
    fallback sized to `len(items)`. Does not log any API credentials.
    """
    payload_items = [
        {
            "id": i,
            "headline": it.get("title", ""),
            "article_text": (it.get("article_text") or "")[:ARTICLE_EXCERPT_CHARS]
            or None,
        }
        for i, it in enumerate(items)
    ]
    user_msg = json.dumps(
        {"ticker": ticker, "items": payload_items}, ensure_ascii=False
    )
    resp = client.chat.completions.create(
        model=MODEL,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )
    raw = resp.choices[0].message.content or ""
    cleaned = _strip_code_fences(raw)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        print(f"[tagger] JSON parse failed ({exc}); raw response: {raw!r}")
        return _fallback_batch(items)

    if not isinstance(parsed, list):
        print(
            f"[tagger] expected JSON array, got {type(parsed).__name__}; "
            f"raw response: {raw!r}"
        )
        return _fallback_batch(items)

    # Re-align outputs to input order by `id`. Guards against the LLM reordering,
    # dropping, or duplicating items. Any input slot that doesn't find a matching
    # id gets a neutral fallback so downstream zip() still pairs correctly.
    tag_by_id: dict[int, dict[str, Any]] = {}
    skipped_no_id = 0
    for obj in parsed:
        if not isinstance(obj, dict):
            continue
        raw_id = obj.get("id")
        if raw_id is None:
            skipped_no_id += 1
            continue
        try:
            tag_by_id[int(raw_id)] = obj
        except (TypeError, ValueError):
            skipped_no_id += 1

    aligned: list[dict[str, Any]] = []
    missing = 0
    for i, src in enumerate(items):
        obj = tag_by_id.get(i)
        if obj is None:
            missing += 1
            title = src.get("title", "") or ""
            aligned.append(
                {
                    "id": i,
                    "short_headline": title,
                    "full_headline": title,
                    "summary": title,
                    "importance": "medium",
                    "surprise": False,
                    "reason": "alignment failed",
                    "quadrant": DEFAULT_QUADRANT,
                    "relevance": "passing",
                }
            )
        else:
            aligned.append(obj)

    if skipped_no_id or missing:
        # Keep wording in sync with the user-facing spec — they grep for this.
        logger.warning(
            "[tagger %s] alignment: %d output objects lacked a valid id; "
            "fell back to original headline",
            ticker,
            missing or skipped_no_id,
        )

    return aligned


def _tag_one_ticker(
    client: OpenAI, ticker: str, items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """OpenAI call + shape merge for one ticker. Runs in a thread worker."""
    if not items:
        return []
    tag_objs = _call_tagger(client, ticker, items)
    # Log the raw model output so we can see what quadrants / key facts the LLM picked.
    logger.info("[tagger %s] raw model output: %s", ticker, tag_objs)
    merged: list[dict[str, Any]] = []
    for item, tag_obj in zip(items, tag_objs):
        importance = str(tag_obj.get("importance", "medium")).lower()
        if importance not in ("high", "medium"):
            importance = "medium"
        surprise = bool(tag_obj.get("surprise", False))
        raw_quadrant = str(tag_obj.get("quadrant", DEFAULT_QUADRANT)).lower()
        quadrant = (
            raw_quadrant if raw_quadrant in VALID_QUADRANTS else DEFAULT_QUADRANT
        )
        raw_relevance = str(tag_obj.get("relevance", DEFAULT_RELEVANCE)).lower()
        relevance = (
            raw_relevance if raw_relevance in VALID_RELEVANCE else DEFAULT_RELEVANCE
        )
        # Prefer the model's summaries; fall back to the original title if empty.
        short_headline = (
            str(tag_obj.get("short_headline") or "").strip() or item["title"]
        )
        full_headline = (
            str(tag_obj.get("full_headline") or "").strip() or item["title"]
        )
        summary = str(tag_obj.get("summary") or "").strip()
        result = {
            "headline": full_headline,
            "short_headline": short_headline,
            "full_headline": full_headline,
            "summary": summary,
            "original_title": item["title"],
            "published_time": item["published_utc"],
            "url": item.get("url"),
            "tag": _display_tag(importance, surprise),
            "reason": tag_obj.get("reason", ""),
            "quadrant": quadrant,
            "relevance": relevance,
        }
        if raw_quadrant != quadrant:
            logger.warning(
                "[tagger %s] invalid quadrant %r coerced to %r (headline=%r)",
                ticker,
                raw_quadrant,
                quadrant,
                item["title"][:60],
            )
        logger.info(
            "[tagger %s] Tagged item: original=%r  short=%r  full=%r  %s/%s/%s",
            ticker,
            item["title"][:60],
            short_headline[:60],
            full_headline[:80],
            _display_tag(importance, surprise),
            quadrant,
            "has_article" if item.get("article_text") else "no_article",
        )
        merged.append(result)
    return merged


async def tag_all_async(
    news_by_ticker: dict[str, list[dict[str, Any]]]
) -> dict[str, list[dict[str, Any]]]:
    """Tag every ticker in parallel via the default threadpool.

    OpenAI's sync client is thread-safe, so a single instance is shared across
    workers. A Semaphore(3) caps concurrent OpenAI calls to bound the peak
    memory held by in-flight request/response buffers (each call holds ~2-5 KB
    of JSON plus transient HTTP client state; 10+ simultaneous calls add up on
    a 512 MB Render instance). Per-ticker failures fall back to an empty list
    so the rest of the snapshot survives.
    """
    client = OpenAI(api_key=OPENAI_API_KEY)
    loop = asyncio.get_running_loop()
    # Created inside the coroutine so it binds to whichever event loop the
    # sync wrapper (asyncio.run) is currently running on.
    sem = asyncio.Semaphore(3)

    async def _tag_with_limit(
        ticker: str, items: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        async with sem:
            return await loop.run_in_executor(
                None, _tag_one_ticker, client, ticker, items
            )

    tickers = list(news_by_ticker.keys())
    results = await asyncio.gather(
        *(_tag_with_limit(t, news_by_ticker[t]) for t in tickers),
        return_exceptions=True,
    )
    tagged: dict[str, list[dict[str, Any]]] = {}
    for ticker, result in zip(tickers, results):
        if isinstance(result, Exception):
            logger.warning("[tagger] failed for %s: %s", ticker, result)
            tagged[ticker] = []  # drop tags; upstream treats missing ticker as no items
        else:
            tagged[ticker] = result
    return tagged


def tag_all(
    news_by_ticker: dict[str, list[dict[str, Any]]]
) -> dict[str, list[dict[str, Any]]]:
    """Sync wrapper around tag_all_async. Safe from non-async contexts only
    (scheduler threads, `run_in_executor` workers, CLI). From inside an async
    context, call tag_all_async directly.
    """
    return asyncio.run(tag_all_async(news_by_ticker))


def select_top_3(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Priority: 🔴⚡ → 🔴 → 🟡⚡ → 🟡. Tiebreak: most recent timestamp first."""
    def sort_key(x: dict[str, Any]) -> tuple[int, float]:
        pub: datetime = x["published_time"]
        return (TAG_PRIORITY.get(x["tag"], 99), -pub.timestamp())

    return sorted(items, key=sort_key)[:3]


def print_top_3(tagged: dict[str, list[dict[str, Any]]]) -> None:
    for ticker, items in tagged.items():
        top = select_top_3(items)
        parts = [f"[{it['tag']} {it['headline']}]" for it in top]
        print(f"{ticker}  {' '.join(parts)}")
    print("--- Tagging Complete ---")


if __name__ == "__main__":
    news = fetch_all()
    results = tag_all(news)
    print_top_3(results)
