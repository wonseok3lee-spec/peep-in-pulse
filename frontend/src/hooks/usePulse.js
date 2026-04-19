import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

const POLL_INTERVAL_MS = 60_000;
const CACHE_KEY = "pulse:snapshot";

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.data !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data, lastUpdated) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, lastUpdated, timestamp: Date.now() })
    );
  } catch {
    // silent fail (quota exceeded, etc.)
  }
}

/**
 * Fetches /pulse snapshot with sessionStorage caching.
 * First load: seeds from cache if present (instant render), still
 * triggers a background refresh. Subsequent background refreshes
 * never flip loading back to true.
 */
export function usePulse() {
  const cached = readCache();
  const [data, setData] = useState(cached?.data ?? {});
  const [lastUpdated, setLastUpdated] = useState(cached?.lastUpdated ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const doFetch = async (isInitial) => {
      try {
        if (isInitial && !cached) setLoading(true);
        const res = await fetch(`${API_URL}/pulse`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const isBuilding = json.building === true;
        setBuilding(isBuilding);
        if (!isBuilding) {
          // Only commit / cache when the backend actually has data. During
          // the initial build the response is {data:{}, last_updated:null},
          // and overwriting cached state with that would blank out a valid
          // second-session paint. The next 60 s poll will fill real data.
          const nextData = json.data ?? {};
          const nextUpdated = json.last_updated ?? null;
          setData(nextData);
          setLastUpdated(nextUpdated);
          writeCache(nextData, nextUpdated);
        }
        setError(null);
      } catch (e) {
        if (e.name === "AbortError") return;
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch(true);
    const intervalId = setInterval(() => doFetch(false), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, lastUpdated, loading, error, building };
}
