"""FastAPI service: /pulse (top-3 tagged headlines per ticker) + /health.

A background scheduler runs every 5 minutes: fetch_all → tag_all → store.
Frontend reads the pre-computed snapshot; no LLM call on the request path,
so every request is instant.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import yfinance as yf
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import TICKERS
from news_fetcher import fetch_all
from tagger import tag_all

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

ET_TZ = ZoneInfo("America/New_York")

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

# Sidebar/TickerHeader poll /proxy/price every 60 s per ticker; with N rows
# that's N requests/min upstream. A 30 s TTL collapses most of that to cache
# hits — price changes within 30 s aren't meaningfully useful in the UI.
_price_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_PRICE_TTL = 30

# Chart payloads (sparklines + CompareTab history). Keyed by
# (ticker, interval, range, period1, period2). Intraday bars get a short
# TTL so a fresh 5-min bar shows up in the watchlist sparkline within ~1-2
# min of its close; daily+ bars change slowly, so we keep the longer TTL
# for snappy tab/period switches.
_chart_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_CHART_TTL_INTRADAY = 90
_CHART_TTL_DAILY = 300

# Shared AsyncClient singleton so every /proxy/* endpoint reuses TCP/TLS
# connections to Yahoo instead of paying a fresh handshake per request.
# Built lazily on first use; closed in lifespan shutdown.
_http_client: httpx.AsyncClient | None = None


async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=40,
            ),
            headers=_YF_HEADERS,
        )
    return _http_client


def _to_iso_z(dt: datetime) -> str:
    """Format UTC datetime as 'YYYY-MM-DDTHH:MM:SSZ'."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# On-disk snapshot so user-added tickers survive OOM / crash restarts on
# Render. NOT redeploy-durable (Render wipes the filesystem on deploy), but
# that's acceptable since the scheduler and /tickers/add will rebuild the
# state organically. See .gitignore — this file is never committed.
SNAPSHOT_PATH = Path(__file__).parent / "snapshot.json"


def _save_snapshot() -> None:
    """Atomically persist the current pulse snapshot to disk.

    Builds the payload under `_state_lock` (brief reference-only dict copy),
    then serializes and writes outside the lock so slow disk I/O doesn't
    block request handlers or the scheduler thread.
    """
    try:
        with _state_lock:
            payload = {
                "last_updated": (
                    _to_iso_z(_last_updated) if _last_updated else None
                ),
                "extra_tickers": sorted(_extra_tickers),
                "data": _last_result,
            }
        body = json.dumps(payload, ensure_ascii=False, default=str)
        tmp = SNAPSHOT_PATH.with_suffix(".json.tmp")
        tmp.write_text(body, encoding="utf-8")
        tmp.replace(SNAPSHOT_PATH)  # atomic on POSIX and Windows
    except Exception as exc:
        logger.warning("[snapshot] save failed: %s", exc)


def _load_snapshot() -> None:
    """Populate in-memory state from disk if a snapshot file exists.

    Called once at startup before the scheduler fires, so /pulse can serve
    cached data immediately instead of showing `building: true` for the
    full scheduler interval after every crash/restart.
    """
    global _last_result, _last_updated, _snapshot_building
    if not SNAPSHOT_PATH.exists():
        return
    try:
        payload = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("[snapshot] load failed: %s", exc)
        return

    data = payload.get("data") or {}
    last_updated_str = payload.get("last_updated")
    extras = payload.get("extra_tickers") or []

    parsed_updated: datetime | None = None
    if last_updated_str:
        try:
            parsed_updated = datetime.fromisoformat(
                last_updated_str.replace("Z", "+00:00")
            )
        except ValueError:
            parsed_updated = None

    with _state_lock:
        _last_result = data
        _last_updated = parsed_updated
        _extra_tickers.update(extras)
        # Flip the "still priming" gate so /pulse serves cached data on the
        # very first request after boot, not `building: true` for 5 minutes.
        if data:
            _snapshot_building = False

    logger.info(
        "[snapshot] loaded %d tickers, %d extras from %s",
        len(data),
        len(extras),
        SNAPSHOT_PATH,
    )


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
    logger.info(
        "_refresh_pulse triggered at ET: %s",
        datetime.now(ET_TZ).strftime("%Y-%m-%d %H:%M:%S %Z %A"),
    )
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
    _save_snapshot()
    print(
        f"[main] pulse refreshed at {_to_iso_z(now)} ({len(all_tickers)} tickers)"
    )


_scheduler = BackgroundScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # First: rehydrate any snapshot the previous process left on disk so
    # /pulse can serve cached data instantly instead of showing `building:
    # true` for the whole first scheduler interval after every crash.
    _load_snapshot()
    # Then kick the initial snapshot build into the background and yield
    # immediately so uvicorn starts accepting requests right away. The
    # background prime will overwrite the disk-loaded data with fresher
    # content when it completes. Offloading to the default executor gives
    # the inner asyncio.run() (in fetch_all) a clean host thread instead
    # of clashing with the running lifespan loop.
    asyncio.get_running_loop().run_in_executor(None, _refresh_pulse)

    # Market-aware refresh schedule (America/New_York, DST-aware).
    # Each trigger below is one APScheduler job on _refresh_pulse; windows
    # are non-overlapping so no minute fires twice.
    job_specs = [
        # Premarket Mon–Fri 04:00–08:30 ET, every 30 min
        ("pulse_premarket_half", CronTrigger(
            day_of_week="mon-fri", hour="4-8", minute="0,30", timezone=ET_TZ)),
        # Premarket closer: Mon–Fri 09:00 ET (top of hour only; 09:30 belongs
        # to the regular-hours schedule below)
        ("pulse_premarket_nine", CronTrigger(
            day_of_week="mon-fri", hour=9, minute=0, timezone=ET_TZ)),
        # Regular hours opener: Mon–Fri 09:30 and 09:45 ET
        ("pulse_rth_open", CronTrigger(
            day_of_week="mon-fri", hour=9, minute="30,45", timezone=ET_TZ)),
        # Regular hours body: Mon–Fri 10:00–15:45 ET, every 15 min
        ("pulse_rth_body", CronTrigger(
            day_of_week="mon-fri", hour="10-15", minute="0,15,30,45", timezone=ET_TZ)),
        # Aftermarket earnings window: Mon–Fri 16:00 and 18:00 ET only
        ("pulse_aftermarket", CronTrigger(
            day_of_week="mon-fri", hour="16,18", minute=0, timezone=ET_TZ)),
        # Sunday evening reopen: Sun 18:00–23:00 ET, every 60 min
        ("pulse_sun_evening", CronTrigger(
            day_of_week="sun", hour="18-23", minute=0, timezone=ET_TZ)),
        # Monday overnight tail: Mon 00:00–03:00 ET, every 60 min
        ("pulse_mon_overnight", CronTrigger(
            day_of_week="mon", hour="0-3", minute=0, timezone=ET_TZ)),
    ]
    for job_id, trigger in job_specs:
        _scheduler.add_job(
            _refresh_pulse,
            trigger=trigger,
            id=job_id,
            max_instances=1,
            coalesce=True,
        )
    _scheduler.start()
    try:
        yield
    finally:
        global _http_client
        if _http_client is not None:
            await _http_client.aclose()
            _http_client = None
        _scheduler.shutdown(wait=False)


app = FastAPI(title="peep-in-pulse", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev
        "http://localhost:4173",  # Vite preview (prod build)
        "http://localhost:4174",  # Secondary preview port
        "https://peep-in-pulse.vercel.app",  # Vercel production (default domain)
        "https://peepintopulse.com",  # Custom apex domain
        "https://www.peepintopulse.com",  # Custom www subdomain
    ],
    # Vercel preview deploys use dynamic subdomains
    # (peep-in-pulse-git-<branch>-<hash>.vercel.app); the regex lets
    # any peep-in-pulse-* preview hit the backend without per-branch
    # config churn.
    allow_origin_regex=r"https://peep-in-pulse-[a-z0-9-]+\.vercel\.app",
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
    """Proxy Yahoo Finance chart endpoint to avoid browser CORS.

    30 s TTL cache so the N watchlist rows × 60 s poll don't fan out to
    fresh Yahoo requests on every tick.
    """
    now = time.time()
    cached = _price_cache.get(ticker)
    if cached and (now - cached[0]) < _PRICE_TTL:
        return cached[1]

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    client = await get_http_client()
    r = await client.get(url, params={"interval": "1d", "range": "5d"})
    data = r.json()
    with _state_lock:
        _price_cache[ticker] = (now, data)
    return data


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
    ttl = _CHART_TTL_INTRADAY if intraday else _CHART_TTL_DAILY

    # Cache key: all params contribute since different params → different data.
    # None values stringify as "None" and act as a stable sentinel for "unset".
    cache_key = f"{ticker}|{interval}|{range}|{period1}|{period2}"
    now = time.time()
    cached = _chart_cache.get(cache_key)
    if cached and (now - cached[0]) < ttl:
        return cached[1]

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
    if intraday:
        # Suppress pre-market + after-hours when asking Yahoo. Belt-and-
        # suspenders paired with the post-fetch hour trim below.
        params["includePrePost"] = "false"

    logger.info("[CHART] %s params=%s", ticker, params)

    client = await get_http_client()
    # Chart payloads can be large; use a generous per-request timeout override
    # on top of the shared client's default.
    r = await client.get(url, params=params, timeout=15.0)
    data = r.json()

    # For intraday, always trim to regular session by local hour. The Yahoo
    # `includePrePost=false` flag is sometimes honored, sometimes not; this
    # fallback uses `meta.gmtoffset` to filter deterministically.
    if intraday:
        _trim_to_regular_session_by_hour(data)

    with _state_lock:
        _chart_cache[cache_key] = (now, data)
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


class SyncRequest(BaseModel):
    tickers: list[str]


@app.post("/tickers/sync")
async def sync_tickers(req: SyncRequest):
    """Frontend calls this on boot with its localStorage watchlist.

    Ensures every ticker is in _extra_tickers (so the 5-min scheduler keeps
    it fresh), and kicks off a background fetch for any ticker not already
    in _last_result. Recovers user-added tickers after backend restarts
    that wiped in-memory state faster than disk rehydration can.
    """
    added: list[str] = []
    fetched: list[str] = []

    for raw in req.tickers:
        sym = (raw or "").strip().upper()
        if not sym or len(sym) > 10:
            continue

        with _state_lock:
            was_new_extra = sym not in _extra_tickers
            _extra_tickers.add(sym)
            has_data = sym in _last_result

        if was_new_extra:
            added.append(sym)

        if not has_data:
            # Fire-and-forget; _fetch_and_cache_ticker writes into
            # _last_result + calls _save_snapshot on success.
            asyncio.create_task(_fetch_and_cache_ticker(sym))
            fetched.append(sym)

    # Persist the _extra_tickers update so the new entries survive even
    # if no background fetch completes before the next restart.
    if added:
        _save_snapshot()

    return {
        "added_to_extra": added,
        "fetching": fetched,
        "total_synced": len(req.tickers),
    }


async def _fetch_and_cache_ticker(ticker: str) -> None:
    _bg_start = time.time()
    logger.info("[bg-fetch] START %s", ticker)
    try:
        loop = asyncio.get_running_loop()
        snapshot = await loop.run_in_executor(None, _build_snapshot, [ticker])
        items = snapshot.get(ticker, [])
        with _state_lock:
            _last_result[ticker] = items
        _save_snapshot()
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

    client = await get_http_client()
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

    with _state_lock:
        _screener_cache[scr_id] = (now, results)
    return results
