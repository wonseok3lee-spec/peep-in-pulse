import { useEffect, useState } from "react";

const PERIOD_PARAMS = {
  "1D": { interval: "5m", range: "1d" },
  "5D": { interval: "30m", range: "5d" },
  "1M": { interval: "1d", range: "1mo" },
  "6M": { interval: "1d", range: "6mo" },
  "1Y": { interval: "1d", range: "1y" },
};

export function useSparkline(ticker, period = "1D") {
  const [data, setData] = useState({ points: [], timestamps: [] });

  useEffect(() => {
    if (!ticker) return;
    const { interval, range } = PERIOD_PARAMS[period] ?? PERIOD_PARAMS["1D"];
    fetch(
      `http://localhost:8000/proxy/chart/${ticker}?interval=${interval}&range=${range}`
    )
      .then((r) => r.json())
      .then((json) => {
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
  }, [ticker, period]);

  return data;
}
