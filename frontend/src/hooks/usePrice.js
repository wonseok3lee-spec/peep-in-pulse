import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

const POLL_MS = 60_000;

// Module-level per-ticker subscription registry. All components calling
// usePrice(ticker) for the same ticker share a single poll loop and a single
// snapshot, so the watchlist sidebar and dashboard card can never drift to
// different prices/percentages for the same symbol.
const _registry = new Map();

function _emptySnapshot() {
  return {
    price: null,
    changePct: null,
    currency: null,
    companyName: null,
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
    const url = `${API_URL}/proxy/price/${encodeURIComponent(ticker)}`;
    const res = await fetch(url, { signal });
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

    _publish(ticker, {
      price,
      changePct,
      currency: meta.currency ?? null,
      companyName: meta.shortName ?? meta.longName ?? meta.symbol ?? ticker,
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
 * Poll Yahoo Finance (via /proxy/price) every 60 s for the latest price and
 * day-over-day % change for a ticker. All callers for the same ticker share a
 * single poll loop + snapshot, so rendered values never diverge between
 * components.
 *
 * Returns { price, changePct, currency, companyName, loading, error }.
 */
export function usePrice(ticker) {
  const [state, setState] = useState(_emptySnapshot);

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
    return _subscribe(ticker, setState);
  }, [ticker]);

  return state;
}

// Exposed for the multi-ticker usePrices hook so it can share this module's
// registry (single poll loop per symbol across Sidebar + Risk + anywhere else).
export { _subscribe as subscribePrice };
