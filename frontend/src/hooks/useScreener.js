import { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";
const CACHE_PREFIX = "pulse:screener:";

function readCache(scrId) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + scrId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(scrId, data) {
  try {
    sessionStorage.setItem(
      CACHE_PREFIX + scrId,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // Storage full or blocked — silently ignore; cache is a perf hint, not truth.
  }
}

export function useScreener(scrId) {
  // Seed from sessionStorage synchronously so first paint after a refresh
  // shows real data instead of skeletons. Session-scoped (not localStorage)
  // so stale data can't persist across browser sessions.
  const cached = readCache(scrId);
  const [data, setData] = useState(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async (isInitial) => {
      try {
        if (isInitial && !cached) setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/proxy/screener/${scrId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        writeCache(scrId, json);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      }
    };

    fetchData(true);
    const intervalId = setInterval(() => fetchData(false), 60_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrId]);

  return { data, loading, error };
}
