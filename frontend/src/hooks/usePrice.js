import { useEffect, useState } from "react";

const POLL_MS = 60_000;

/**
 * Poll Yahoo Finance v8 chart endpoint every 30 s for the latest price and
 * day-over-day % change for a ticker.
 *
 * Returns { price, changePct, currency, companyName, loading, error }.
 * Yahoo sometimes declines CORS depending on region/load — on failure we
 * surface `error` and the caller shows "--".
 */
export function usePrice(ticker) {
  const [state, setState] = useState({
    price: null,
    changePct: null,
    currency: null,
    companyName: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!ticker) {
      setState({
        price: null,
        changePct: null,
        currency: null,
        companyName: null,
        loading: false,
        error: null,
      });
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchOnce = async () => {
      try {
        const url = `http://localhost:8000/proxy/price/${encodeURIComponent(
          ticker
        )}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result) throw new Error("no chart result");

        const meta = result.meta ?? {};
        const price = meta.regularMarketPrice ?? null;
        const closes = result?.indicators?.quote?.[0]?.close ?? [];
        const validCloses = closes.filter((c) => c != null && !isNaN(c));
        const lastClose = validCloses[validCloses.length - 1] ?? null;
        const prevClose = validCloses[validCloses.length - 2] ?? null;
        const changePct =
          lastClose != null && prevClose != null && prevClose !== 0
            ? ((lastClose - prevClose) / prevClose) * 100
            : null;

        if (cancelled) return;
        setState({
          price,
          changePct,
          currency: meta.currency ?? null,
          companyName:
            meta.shortName ?? meta.longName ?? meta.symbol ?? ticker,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        setState((s) => ({ ...s, loading: false, error: err }));
      }
    };

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [ticker]);

  return state;
}
