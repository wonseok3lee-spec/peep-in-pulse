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

// Dedupe concurrent fetches for the same ticker. If one is already in flight,
// callers (setInterval + useEffect + future triggers) piggyback on it —
// subscribers receive the same _publish once it settles.
function _triggerFetch(ticker) {
  const entry = _registry.get(ticker);
  if (!entry) return;
  if (entry.inflight) return;
  entry.inflight = (async () => {
    try {
      await _fetchOnce(ticker, entry.controller.signal);
    } finally {
      const live = _registry.get(ticker);
      if (live) live.inflight = null;
    }
  })();
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
      inflight: null,
    };
    _registry.set(ticker, entry);
    // Schedule ongoing 60s poll. The first fetch is kicked off from the
    // useEffect below so every fresh mount always triggers one (even when
    // joining an existing registry entry) — dedup ensures no duplicate
    // HTTP requests.
    entry.timer = setInterval(() => _triggerFetch(ticker), POLL_MS);
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
    const unsubscribe = _subscribe(ticker, setState);
    // Immediate fetch on every mount — not just the first subscriber —
    // so the Sidebar chip appears within one round-trip rather than
    // waiting up to 60 s for the next interval tick. Dedup in
    // _triggerFetch collapses concurrent calls to a single HTTP request.
    _triggerFetch(ticker);
    return unsubscribe;
  }, [ticker]);

  return state;
}
