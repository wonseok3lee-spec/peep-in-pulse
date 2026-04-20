import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../lib/api";

// Adaptive polling: fast (5 s) while the backend is priming or a newly
// added ticker is materializing; slow (60 s) once ticker count has been
// stable for a few polls. The UX goal: user adds a ticker → their new
// data surfaces within one fast-poll window, not a full slow window.
const POLL_FAST_MS = 5_000;
const POLL_SLOW_MS = 60_000;
const STABLE_POLLS_TO_SLOW = 3;
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
 * Fetches /pulse snapshot with sessionStorage caching and adaptive polling.
 *
 * Returns `{ data, lastUpdated, loading, error, building, bump }`.
 *   - bump(): callable by parent code (e.g. App.jsx's addTicker) to force
 *     the next poll onto the fast cadence. Without this external signal,
 *     the hook only notices a new ticker when it appears in /pulse's
 *     response, which can be up to 60 s after the user's action.
 */
export function usePulse() {
  const cached = readCache();
  const [data, setData] = useState(cached?.data ?? {});
  const [lastUpdated, setLastUpdated] = useState(cached?.lastUpdated ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [building, setBuilding] = useState(false);
  const [fastMode, setFastMode] = useState(true);
  // Tracks the last response's ticker count and how many consecutive polls
  // have reported that same count. When `stable >= STABLE_POLLS_TO_SLOW`
  // we slow the interval down. A ref (not state) so updating it inside
  // doFetch doesn't trigger re-renders of its own.
  const stabilityRef = useRef({ lastCount: 0, stable: 0 });

  const bump = useCallback(() => {
    setFastMode(true);
    stabilityRef.current = {
      lastCount: stabilityRef.current.lastCount,
      stable: 0,
    };
  }, []);

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
        if (isBuilding) {
          // Still priming — stay fast, don't overwrite cached state with the
          // empty placeholder response.
          setFastMode(true);
          stabilityRef.current = {
            lastCount: stabilityRef.current.lastCount,
            stable: 0,
          };
        } else {
          const nextData = json.data ?? {};
          const nextUpdated = json.last_updated ?? null;
          setData(nextData);
          setLastUpdated(nextUpdated);
          writeCache(nextData, nextUpdated);

          // Adaptive-polling state machine: a new ticker key means
          // "something just got added, keep polling fast"; N consecutive
          // no-change polls means "user isn't interacting, slow down".
          const count = Object.keys(nextData).length;
          const prev = stabilityRef.current;
          if (count > prev.lastCount) {
            stabilityRef.current = { lastCount: count, stable: 0 };
            setFastMode(true);
          } else if (count === prev.lastCount && count > 0) {
            const nextStable = prev.stable + 1;
            stabilityRef.current = { lastCount: count, stable: nextStable };
            if (nextStable >= STABLE_POLLS_TO_SLOW) setFastMode(false);
          } else {
            // Count dropped (ticker removed) or first zero — reset the
            // counter but don't force a mode change either direction.
            stabilityRef.current = { lastCount: count, stable: 0 };
          }
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
    const pollDelay = fastMode ? POLL_FAST_MS : POLL_SLOW_MS;
    const intervalId = setInterval(() => doFetch(false), pollDelay);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastMode]);

  return { data, lastUpdated, loading, error, building, bump };
}
