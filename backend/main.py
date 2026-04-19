"""FastAPI service: /pulse (top-3 tagged headlines per ticker) + /health.

A background scheduler runs every 5 minutes: fetch_all → tag_all → store.
Frontend reads the pre-computed snapshot; no LLM call on the request path,
so every request is instant.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import yfinance as yf
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import TICKERS
from news_fetcher import fetch_all
from tagger import tag_all

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

REFRESH_INTERVAL_MINUTES = 5

# Shared snapshot guarded by a lock. Scheduler thread writes; request handlers read.
_state_lock = threading.Lock()
_last_result: dict[str, list[dict[str, Any]]] = {}
_last_updated: datetime | None = None
# True at server boot, flipped False when the first snapshot build finishes.
# /pulse inspects this to tell the client "still warming up" vs "here's data"
# so the UI can stay responsive while the initial fetch pipeline runs.
_snapshot_building = True
# Tickers the frontend has added on top of the hardcoded TICKERS default.
# The scheduler folds these into every refresh so custom tickers stay fresh.
_extra_tickers: set[str] = set()

# yfinance .info is slow (1–2s per ticker) — cache results for 5 min so the
# Valuation view doesn't rehit Yahoo on every tab switch.
_fundamentals_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_FUNDAMENTALS_TTL = 300

# Top-movers screener results refresh once a minute — that matches Yahoo's
# own update cadence for these predefined screens during market hours.
_screener_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_SCREENER_TTL = 60
_ALLOWED_SCREENERS = (
    "day_gainers",
    "day_losers",
    "most_actives",
    "undervalued_large_caps",
)


def _to_iso_z(dt: datetime) -> str:
    """Format UTC datetime as 'YYYY-MM-DDTHH:MM:SSZ'."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_snapshot(
    tickers: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Fetch + tag + ship ALL items per ticker in /pulse's response shape.

    The prior version capped at top-3 via select_top_3 — that made sense when
    the dashboard only had room for 3 pills, but the quadrant matrix now
    distributes all items across 4 cells, so capping hides most of the feed.
    The client passes every item straight to the grid; the tagger has already
    assigned each a quadrant — trust it.
    """
    news = fetch_all(tickers)
    tagged = tag_all(news)
    snapshot: dict[str, list[dict[str, Any]]] = {}
    for ticker, items in tagged.items():
        snapshot[ticker] = [
            {
                "tag": it["tag"],
                "headline": it["headline"],
                "short_headline": it.get("short_headline", it["headline"]),
                "full_headline": it.get("full_headline", it["headline"]),
                "summary": it.get("summary") or it.get("reason") or "",
                "reason": it["reason"],
                "quadrant": it["quadrant"],
                "published_time": it["published_time"].isoformat()
                if it.get("published_time")
                else None,
                "url": it.get("url", None),
            }
            for it in items
        ]

    logger.info(
        "Snapshot quadrants: %s",
        [
            (it["headline"][:30], it.get("quadrant", "MISSING"))
            for items in snapshot.values()
            for it in items
        ],
    )
    return snapshot


def _refresh_pulse() -> None:
    """One fetch → tag → store cycle. Runs on the scheduler's thread."""
    global _last_result, _last_updated, _snapshot_building
    with _state_lock:
        all_tickers = list(TICKERS) + [
            t for t in _extra_tickers if t not in TICKERS
        ]
    try:
        snapshot = _build_snapshot(all_tickers)
    except Exception as exc:
        # Never crash the scheduler; keep the last known good snapshot.
        # Log the exception *type only* — never the message, which can contain
        # key fragments echoed back by provider SDKs (e.g. OpenAI 401s).
        print(f"[main] refresh failed: {type(exc).__name__}")
        return

    now = datetime.now(timezone.utc)
    with _state_lock:
        _last_result = snapshot
        _last_updated = now
        _snapshot_building = False
    print(
        f"[main] pulse refreshed at {_to_iso_z(now)} ({len(all_tickers)} tickers)"
    )


_scheduler = BackgroundScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick the initial snapshot build into the background and yield immediately
    # so uvicorn starts accepting requests right away. /pulse returns
    # `building: true` with an empty snapshot until this task finishes; the
    # frontend's 60 s poll picks up real data on the next cycle. Offloading to
    # the default executor gives the inner asyncio.run() (in fetch_all) a
    # clean host thread instead of clashing with the running lifespan loop.
    asyncio.get_running_loop().run_in_executor(None, _refresh_pulse)
    _scheduler.add_job(
        _refresh_pulse,
        trigger="interval",
        minutes=REFRESH_INTERVAL_MINUTES,
        id="pulse_refresh",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    try:
        yield
    finally:
        _scheduler.shutdown(wait=False)


app = FastAPI(title="peep-in-pulse", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev
        "http://localhost:4173",  # Vite preview (prod build)
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/pulse")
def pulse() -> dict[str, Any]:
    with _state_lock:
        is_building = _snapshot_building
        updated = None if is_building else _last_updated
        data = {} if is_building else _last_result
    return {
        "last_updated": _to_iso_z(updated) if updated else None,
        "data": data,
        "building": is_building,
    }


_YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


@app.get("/proxy/price/{ticker}")
async def proxy_price(ticker: str):
    """Proxy Yahoo Finance chart endpoint to avoid browser CORS."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            url, params={"interval": "1d", "range": "5d"}, headers=_YF_HEADERS
        )
        return r.json()


@app.get("/proxy/chart/{ticker}")
async def proxy_chart(
    ticker: str,
    interval: str = "1d",
    range: str | None = None,
    period1: int | None = None,
    period2: int | None = None,
):
    """Proxy Yahoo Finance for historical chart data (used by CompareTab).

    Accepts either `range` (Yahoo shorthand: "1mo", "max", "ytd") or an
    explicit `period1`/`period2` unix-second window. period1/period2 wins
    when both are set, supporting the Custom date-range picker.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params: dict[str, Any] = {"interval": interval}
    if period1 is not None and period2 is not None:
        params["period1"] = period1
        params["period2"] = period2
    elif range:
        params["range"] = range
    else:
        params["range"] = "1mo"
    # Suppress pre-market + after-hours bars on intraday intervals. Without
    # this, 1D charts span ~20 hours with spiky extended-hours noise. The
    # post-fetch tradingPeriods trim is a backstop if this flag is ignored.
    intraday = interval in (
        "1m",
        "2m",
        "5m",
        "15m",
        "30m",
        "60m",
        "90m",
        "1h",
    )
    if intraday:
        # Suppress pre-market + after-hours when asking Yahoo. Belt-and-
        # suspenders paired with the post-fetch hour trim below.
        params["includePrePost"] = "false"

    logger.info("[CHART] %s params=%s", ticker, params)

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params=params, headers=_YF_HEADERS)
        data = r.json()

    # For intraday, always trim to regular session by local hour. The Yahoo
    # `includePrePost=false` flag is sometimes honored, sometimes not; this
    # fallback uses `meta.gmtoffset` to filter deterministically.
    if intraday:
        _trim_to_regular_session_by_hour(data)

    return data


def _trim_to_regular_session_by_hour(data: dict[str, Any]) -> None:
    """Mutates the Yahoo chart response to keep only 09:30–16:00 local bars.

    Uses `meta.gmtoffset` (exchange's offset from UTC in seconds) to convert
    each timestamp to the exchange's local time, then keeps only bars that
    fall within the regular session window. Works for any exchange Yahoo
    reports — US markets, KOSPI, TSE, LSE, etc.
    """
    try:
        result = data["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        return

    timestamps = result.get("timestamp") or []
    if not timestamps:
        return

    meta = result.get("meta") or {}
    gmt_offset = meta.get("gmtoffset") or 0

    regular_open = 9 * 60 + 30  # 09:30
    regular_close = 16 * 60  # 16:00

    keep: list[int] = []
    for i, ts in enumerate(timestamps):
        dt = datetime.fromtimestamp(int(ts), tz=timezone.utc) + timedelta(
            seconds=gmt_offset
        )
        minutes_of_day = dt.hour * 60 + dt.minute
        if regular_open <= minutes_of_day <= regular_close:
            keep.append(i)

    if not keep or len(keep) == len(timestamps):
        return

    result["timestamp"] = [timestamps[i] for i in keep]
    indicators = result.get("indicators") or {}
    for group in ("quote", "adjclose"):
        series_list = indicators.get(group) or []
        for series in series_list:
            for field, arr in list(series.items()):
                if isinstance(arr, list) and len(arr) == len(timestamps):
                    series[field] = [arr[i] for i in keep]


@app.get("/proxy/fundamentals/{ticker}")
async def proxy_fundamentals(ticker: str):
    """Fetch fundamentals via yfinance (handles Yahoo crumb auth automatically).

    yf.Ticker(t).info is sync and slow (~1–2s per ticker); we run it in a
    threadpool and cache results for 5 min so the Valuation view doesn't
    rehit Yahoo on every tab switch.
    """
    t = ticker.upper()
    now = time.time()
    cached = _fundamentals_cache.get(t)
    if cached and now - cached[0] < _FUNDAMENTALS_TTL:
        return cached[1]

    try:
        info = await asyncio.get_running_loop().run_in_executor(
            None, lambda: yf.Ticker(t).info
        )

        if not info or info.get("regularMarketPrice") is None:
            logger.warning("[fundamentals] no data for %s", t)
            return {"ticker": t, "error": "no data"}

        result = {
            "ticker": t,
            "name": info.get("longName") or info.get("shortName"),
            "currentPrice": info.get("regularMarketPrice")
            or info.get("currentPrice"),
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "priceToBook": info.get("priceToBook"),
            "priceToSales": info.get("priceToSalesTrailing12Months"),
            "marketCap": info.get("marketCap"),
            "beta": info.get("beta"),
            "trailingEPS": info.get("trailingEps"),
            "forwardEPS": info.get("forwardEps"),
            "earningsGrowth": info.get("earningsGrowth"),
            "revenueGrowth": info.get("revenueGrowth"),
            "profitMargin": info.get("profitMargins"),
            "operatingMargin": info.get("operatingMargins"),
            "dividendYield": info.get("dividendYield"),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "currency": info.get("currency"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
        }

        logger.info(
            "[fundamentals] %s: PE=%s, Beta=%s, RevGrowth=%s",
            t,
            result["trailingPE"],
            result["beta"],
            result["revenueGrowth"],
        )

        _fundamentals_cache[t] = (now, result)
        return result
    except Exception as e:
        logger.warning(
            "[fundamentals] failed for %s: %s: %s", t, type(e).__name__, e
        )
        return {"ticker": t, "error": str(e)}


@app.post("/tickers/add")
async def add_ticker(ticker: str):
    """Immediately fetch news for a newly added ticker."""
    ticker = ticker.upper().strip()
    if not ticker:
        return {"status": "ok", "ticker": ticker}
    with _state_lock:
        already_cached = ticker in _last_result
        _extra_tickers.add(ticker)
    if not already_cached:
        asyncio.create_task(_fetch_and_cache_ticker(ticker))
    return {"status": "ok", "ticker": ticker}


@app.post("/tickers/sync")
async def sync_tickers(tickers: list[str]):
    _sync_start = time.time()
    logger.info("[sync] REQUEST RECEIVED at %.3f", _sync_start)

    normalized = [t.upper().strip() for t in tickers if t.upper().strip()]
    with _state_lock:
        known = set(_last_result.keys())
    new_tickers = [t for t in normalized if t not in known]
    with _state_lock:
        for t in new_tickers:
            _extra_tickers.add(t)
    for ticker in new_tickers:
        asyncio.create_task(_fetch_and_cache_ticker(ticker))
        logger.info(f"[sync] queued fetch for {ticker}")

    logger.info(
        "[sync] RETURNING after %.3fs, queued=%d",
        time.time() - _sync_start,
        len(new_tickers),
    )
    return {"status": "ok", "queued": new_tickers}


async def _fetch_and_cache_ticker(ticker: str) -> None:
    _bg_start = time.time()
    logger.info("[bg-fetch] START %s", ticker)
    try:
        loop = asyncio.get_running_loop()
        snapshot = await loop.run_in_executor(None, _build_snapshot, [ticker])
        items = snapshot.get(ticker, [])
        with _state_lock:
            _last_result[ticker] = items
        logger.info(
            "[main] immediately fetched %d items for %s", len(items), ticker
        )
        logger.info(
            "[bg-fetch] DONE %s in %.1fs", ticker, time.time() - _bg_start
        )
    except Exception as exc:
        logger.warning(
            "[main] immediate fetch failed for %s: %s",
            ticker,
            type(exc).__name__,
        )
        logger.info(
            "[bg-fetch] DONE %s in %.1fs (failed)",
            ticker,
            time.time() - _bg_start,
        )


@app.get("/proxy/search")
async def proxy_search(q: str):
    url = "https://query1.finance.yahoo.com/v1/finance/search"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            url,
            params={"q": q, "quotesCount": 6, "newsCount": 0},
            headers=_YF_HEADERS,
        )
        return r.json()


async def _fetch_single_screener(
    scr_id: str, client: httpx.AsyncClient
) -> list[dict[str, Any]]:
    """Fetch one Yahoo screener and return normalized rows.

    Returns an empty list on network or shape errors so callers that merge
    multiple sub-screeners can degrade gracefully (a broken small-cap feed
    should not wipe out the large-cap gainers).
    """
    url = (
        "https://query1.finance.yahoo.com/v1/finance/screener/"
        f"predefined/saved?scrIds={scr_id}&count=25"
    )
    try:
        resp = await client.get(url, headers=_YF_HEADERS)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Sub-screener %s fetch failed: %s", scr_id, exc)
        return []

    try:
        quotes = data["finance"]["result"][0]["quotes"]
    except (KeyError, IndexError, TypeError):
        logger.warning("Sub-screener %s unexpected shape", scr_id)
        return []

    return [
        {
            "ticker": q.get("symbol"),
            "name": q.get("shortName") or q.get("longName") or q.get("symbol"),
            "price": q.get("regularMarketPrice"),
            "changePct": q.get("regularMarketChangePercent"),
            "volume": q.get("regularMarketVolume"),
            "marketCap": q.get("marketCap"),
        }
        for q in quotes
    ]


@app.get("/proxy/screener/{scr_id}")
async def proxy_screener(scr_id: str):
    """Return 15 top movers from one of Yahoo's predefined screeners.

    For "day_gainers" this composes large-cap gainers + small-cap gainers
    so smaller stocks with big single-day moves (e.g. CRML) aren't filtered
    out by Yahoo's large-cap-only thresholds. All other IDs fetch a single
    Yahoo screener directly. Results cached 60 s.
    """
    if scr_id not in _ALLOWED_SCREENERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid screener. Allowed: {_ALLOWED_SCREENERS}",
        )

    now = time.time()
    cached = _screener_cache.get(scr_id)
    if cached and (now - cached[0]) < _SCREENER_TTL:
        return cached[1]

    async with httpx.AsyncClient(timeout=15.0) as client:
        if scr_id == "day_gainers":
            large, small = await asyncio.gather(
                _fetch_single_screener("day_gainers", client),
                _fetch_single_screener("small_cap_gainers", client),
            )
            # Dedupe by ticker (keep first occurrence — large-cap wins ties
            # since it comes first), then sort by changePct desc with None
            # values pushed to the bottom.
            seen: set[str] = set()
            deduped: list[dict[str, Any]] = []
            for item in large + small:
                t = item.get("ticker")
                if not t or t in seen:
                    continue
                seen.add(t)
                deduped.append(item)
            deduped.sort(
                key=lambda x: x.get("changePct") or -9999,
                reverse=True,
            )
            results = deduped[:15]
        else:
            results = (await _fetch_single_screener(scr_id, client))[:15]

    _screener_cache[scr_id] = (now, results)
    return results
