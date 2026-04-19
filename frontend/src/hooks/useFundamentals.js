import { useEffect, useState } from "react";

export function useFundamentals(tickers) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);

  const key = tickers.join(",");
  useEffect(() => {
    if (!tickers || tickers.length === 0) {
      setData({});
      return;
    }
    setLoading(true);
    let cancelled = false;

    Promise.all(
      tickers.map((t) =>
        fetch(`http://localhost:8000/proxy/fundamentals/${t}`)
          .then((r) => r.json())
          .then((json) => [t, json])
          .catch(() => [t, null])
      )
    ).then((pairs) => {
      if (cancelled) return;
      const next = {};
      for (const [t, json] of pairs) {
        if (json && !json.error) next[t] = json;
      }
      setData(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading };
}
