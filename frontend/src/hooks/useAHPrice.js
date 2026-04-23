import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

const POLL_MS = 60_000;

// Module-level per-ticker registry so every caller for the same symbol shares
// one poll loop and one snapshot — same pattern as usePrice. Prevents Sidebar
// + TickerHeader from drifting on the AH number.
const _registry = new Map();

function _emptySnapshot() {
  return {
    supported: false,
    marketState: null,
    ahPrice: null,
    ahChangePct: null,
    ahTimestamp: null,
    preMarketPrice: null,
    preMarketChangePct: null,
    preTimestamp: null,
    asOf: null,
    loading: true,
    error: null,
  };
}

function _publish(ticker, patch) {
  const entry = _registry.get(ticker);
  if (!entry) return;
  entry.snapshot = { ...entry.snapshot, ...patch };
  entry.subs.forEach((setState) => setState(entry.snapshot));
}

async function _fetchOnce(ticker, signal) {
  try {
    const url = `${API_URL}/proxy/ah/${encodeURIComponent(ticker)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    _publish(ticker, {
      supported: !!json?.supported,
      marketState: json?.marketState ?? null,
      ahPrice: json?.ahPrice ?? null,
      ahChangePct: json?.ahChangePct ?? null,
      ahTimestamp: json?.ahTimestamp ?? null,
      preMarketPrice: json?.preMarketPrice ?? null,
      preMarketChangePct: json?.preMarketChangePct ?? null,
      preTimestamp: json?.preTimestamp ?? null,
      asOf: json?.asOf ?? null,
      loading: false,
      error: null,
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    _publish(ticker, { loading: false, error: err });
  }
}

function _subscribe(ticker, setState) {
  let entry = _registry.get(ticker);
  if (!entry) {
    entry = {
      snapshot: _emptySnapshot(),
      subs: new Set(),
      timer: null,
      controller: new AbortController(),
      refCount: 0,
    };
    _registry.set(ticker, entry);
    _fetchOnce(ticker, entry.controller.signal);
    entry.timer = setInterval(
      () => _fetchOnce(ticker, entry.controller.signal),
      POLL_MS,
    );
  }
  entry.subs.add(setState);
  entry.refCount += 1;
  setState(entry.snapshot);
  return () => {
    entry.subs.delete(setState);
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      clearInterval(entry.timer);
      entry.controller.abort();
      _registry.delete(ticker);
    }
  };
}

/**
 * Poll /proxy/ah every 60 s for after-hours / pre-market price data.
 *
 * Returns { supported, marketState, ahPrice, ahChangePct, preMarketPrice,
 *           preMarketChangePct, asOf, loading, error }.
 *
 * When `supported` is false, the ticker has no extended-hours data (most
 * non-US exchanges) — callers should render nothing AH-related.
 */
export function useAHPrice(ticker) {
  const [state, setState] = useState(_emptySnapshot);

  useEffect(() => {
    if (!ticker) {
      setState(_emptySnapshot());
      return undefined;
    }
    return _subscribe(ticker, setState);
  }, [ticker]);

  return state;
}
