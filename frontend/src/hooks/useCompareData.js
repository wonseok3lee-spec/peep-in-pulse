import { useEffect, useState } from "react";

// Yahoo's `range` parameter returns the last N of session data, so it handles
// weekends/holidays naturally — asking for `range=1d` on a Saturday still
// returns Friday's session. Using period1/period2 would ask for an explicit
// time window that can be empty when markets are closed.
const PERIOD_PARAMS = {
  "1D": { range: "1d", interval: "5m" },
  "5D": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  YTD: { range: "ytd", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  // Yahoo's "max" returns from IPO to today (e.g. MSFT → 1986).
  Max: { range: "max", interval: "1mo" },
};

export const PERIODS = Object.entries(PERIOD_PARAMS).map(
  ([key, { range, interval }]) => ({ key, range, interval })
);

const DAY = 86_400;

export function getPeriodParams(periodKey) {
  return PERIOD_PARAMS[periodKey] ?? PERIOD_PARAMS["1M"];
}

/** Seconds covered by a Yahoo `range` shorthand — used by the mock generator. */
function rangeSeconds(range) {
  switch (range) {
    case "1d":
      return DAY;
    case "5d":
      return 5 * DAY;
    case "1mo":
      return 30 * DAY;
    case "6mo":
      return 180 * DAY;
    case "ytd":
      return Math.floor(
        (Date.now() -
          new Date(new Date().getFullYear(), 0, 1).getTime()) /
          1000
      );
    case "1y":
      return 365 * DAY;
    case "5y":
      return 5 * 365 * DAY;
    case "10y":
    case "max":
      return 10 * 365 * DAY;
    default:
      return 30 * DAY;
  }
}

/** Build the proxy query params (interval + range OR period1/period2).
 *
 * Custom mode activates implicitly when BOTH customStart and customEnd are
 * supplied — no separate "Custom" period key needed. Falls through to the
 * periodKey lookup otherwise.
 */
function buildFetchParams(periodKey, customStart, customEnd) {
  if (customStart && customEnd) {
    const period1 = Math.floor(new Date(customStart).getTime() / 1000);
    const period2 = Math.floor(new Date(customEnd).getTime() / 1000);
    const spanDays = (period2 - period1) / DAY;
    let interval = "1d";
    if (spanDays > 3650) interval = "1mo";
    else if (spanDays > 1825) interval = "1wk";
    return { interval, period1, period2 };
  }
  const { interval, range } = getPeriodParams(periodKey);
  return { interval, range };
}

/** Fetch via the backend proxy. Returns {points, companyName}. */
async function fetchYahooHistory(ticker, params, signal) {
  const qs = new URLSearchParams(params).toString();
  const url = `http://localhost:8000/proxy/chart/${encodeURIComponent(
    ticker
  )}?${qs}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("no chart result");

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const meta = result.meta ?? {};
  const points = timestamps
    .map((t, i) => ({ ts: t, date: new Date(t * 1000), close: closes[i] }))
    .filter((p) => p.close != null && !Number.isNaN(p.close));

  return {
    points,
    companyName: meta.shortName ?? meta.longName ?? ticker,
    currency: meta.currency ?? null,
  };
}

/** Deterministic-ish random walk so mock series look plausible but differ per ticker. */
function generateMockHistory(params, seed = 0) {
  const { interval, range, period1: p1, period2: p2 } = params;
  const STEP_S = {
    "5m": 300,
    "30m": 1800,
    "1d": 86_400,
    "1wk": 604_800,
    "1mo": 2_592_000,
  }[interval] ?? 86_400;

  const now = Math.floor(Date.now() / 1000);
  const period2 = p2 ?? now;
  const period1 = p1 ?? now - rangeSeconds(range);

  const points = [];
  let price = 100 + seed * 15;
  let t = period1;
  // PRNG seeded by index so each ticker draws a different curve
  let x = seed * 1_000 + 1;
  const rand = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  while (t <= period2) {
    const drift = 0.0004 * (1 + seed * 0.1);
    const shock = (rand() - 0.5) * 0.02;
    price *= 1 + drift + shock;
    points.push({ ts: t, date: new Date(t * 1000), close: price });
    t += STEP_S;
  }
  return { points, companyName: "Sample Data", currency: "USD" };
}

/**
 * Fetch per-ticker history for the given period. On network / CORS failure
 * falls back to deterministic mock series and surfaces `usingMock: true` so
 * the UI can show a "sample data" note.
 *
 * Returns: { data: {ticker: {points, companyName}}, loading, usingMock }
 */
export function useCompareData(
  tickers,
  periodKey,
  customRange = null,
  benchmark = null
) {
  const key = tickers.join(",");
  const customStart = customRange?.start ?? null;
  const customEnd = customRange?.end ?? null;
  const [state, setState] = useState({
    data: {},
    benchmark: null,
    loading: false,
    usingMock: false,
  });

  useEffect(() => {
    if (!tickers.length) {
      setState({ data: {}, benchmark: null, loading: false, usingMock: false });
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const params = buildFetchParams(periodKey, customStart, customEnd);

    (async () => {
      let usedMock = false;

      const fetchTicker = async (t, seed) => {
        try {
          const series = await fetchYahooHistory(t, params, controller.signal);
          if (!series.points.length) throw new Error("no points");
          return series;
        } catch (err) {
          if (err.name === "AbortError") return null;
          usedMock = true;
          return generateMockHistory(params, seed);
        }
      };

      // Benchmark is best-effort: on failure we just hide it rather than mock.
      const fetchBenchmark = async (sym) => {
        try {
          const series = await fetchYahooHistory(
            sym,
            params,
            controller.signal
          );
          if (!series.points.length) return null;
          return { symbol: sym, ...series };
        } catch {
          return null;
        }
      };

      const tickerPromises = tickers.map((t, i) =>
        fetchTicker(t, i).then((r) => [t, r])
      );
      const benchmarkPromise = benchmark
        ? fetchBenchmark(benchmark)
        : Promise.resolve(null);

      const [tickerResults, benchmarkResult] = await Promise.all([
        Promise.all(tickerPromises),
        benchmarkPromise,
      ]);

      if (cancelled) return;
      const data = {};
      for (const [t, v] of tickerResults) if (v) data[t] = v;
      setState({
        data,
        benchmark: benchmarkResult,
        loading: false,
        usingMock: usedMock,
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, periodKey, customStart, customEnd, benchmark]);

  return state;
}
