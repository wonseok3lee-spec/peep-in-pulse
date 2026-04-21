import { useEffect, useState } from "react";
import { subscribePrice } from "./usePrice";

/**
 * Multi-ticker price subscription. Piggybacks on usePrice's module-level
 * registry so components that request the same ticker (Sidebar, Dashboard,
 * Risk scatter) share a single poll loop and a single snapshot — no
 * duplicate fetches, no drift between views.
 *
 * Returns { [ticker]: { price, changePct, currency, companyName, loading, error } }.
 * Tickers not yet resolved appear absent from the map rather than as `null`
 * entries; callers should guard with `map[t]?.field`.
 */
export function usePrices(tickers) {
  // Stable dep key: order-sensitive join of the current ticker list. Using
  // `tickers` directly would re-subscribe on every render since arrays are
  // compared by reference.
  const key = (tickers ?? []).join(",");
  const [state, setState] = useState({});

  useEffect(() => {
    if (!tickers || tickers.length === 0) {
      setState({});
      return undefined;
    }

    // Drop entries for tickers no longer in the list; keep cached snapshots
    // for tickers still present so we don't flash `loading: true` on a
    // reorder / single-item change.
    setState((prev) => {
      const next = {};
      for (const t of tickers) if (prev[t]) next[t] = prev[t];
      return next;
    });

    const unsubs = tickers.map((t) =>
      subscribePrice(t, (snap) =>
        setState((prev) => ({ ...prev, [t]: snap }))
      )
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
