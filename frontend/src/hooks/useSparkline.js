import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

const PERIOD_PARAMS = {
  "1D": { interval: "5m", range: "1d" },
  "5D": { interval: "30m", range: "5d" },
  "1M": { interval: "1d", range: "1mo" },
  "6M": { interval: "1d", range: "6mo" },
  "1Y": { interval: "1d", range: "1y" },
};

// 1D charts add a new 5-min bar every 5 min during market hours, so we
// re-poll the sparkline. Other periods use daily bars that don't move
// intraday, so a one-shot fetch on mount is enough.
const INTRADAY_POLL_MS = 60_000;

export function useSparkline(ticker, period = "1D") {
  const [data, setData] = useState({ points: [], timestamps: [] });

  useEffect(() => {
    if (!ticker) return;
    const { interval, range } = PERIOD_PARAMS[period] ?? PERIOD_PARAMS["1D"];

    let cancelled = false;
    const controller = new AbortController();

    const fetchOnce = () => {
      fetch(
        `${API_URL}/proxy/chart/${ticker}?interval=${interval}&range=${range}`,
        { signal: controller.signal },
      )
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          const closes =
            json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
          const ts = json?.chart?.result?.[0]?.timestamp ?? [];
          const valid = closes
            .map((c, i) => ({ c, t: ts[i] }))
            .filter((x) => x.c != null);
          setData({
            points: valid.map((x) => x.c),
            timestamps: valid.map((x) => x.t),
          });
        })
        .catch(() => {});
    };

    fetchOnce();
    const id = period === "1D" ? setInterval(fetchOnce, INTRADAY_POLL_MS) : null;

    return () => {
      cancelled = true;
      controller.abort();
      if (id) clearInterval(id);
    };
  }, [ticker, period]);

  return data;
}
