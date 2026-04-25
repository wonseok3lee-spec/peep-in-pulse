import { useCallback, useEffect, useMemo, useState } from "react";
import { usePulse } from "./hooks/usePulse";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import CompareTab from "./components/CompareTab";
import RelationsTab from "./components/RelationsTab";
import UpdatesTab from "./components/UpdatesTab";
import { MAX_COMPARE } from "./lib/colors";
import { API_URL } from "./lib/api";

const DEFAULT_WATCHLIST = [];
const MAX_WATCHLIST_SIZE = 6;
const WATCHLIST_FULL_MESSAGE = `Watchlist is full (${MAX_WATCHLIST_SIZE} max). Remove a ticker to add a new one.`;

export default function App() {
  const { data, lastUpdated, loading, error, bump: bumpPulsePolling } =
    usePulse();

  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem("pip_watchlist");
      return saved ? JSON.parse(saved) : DEFAULT_WATCHLIST;
    } catch {
      return DEFAULT_WATCHLIST;
    }
  });

  useEffect(() => {
    localStorage.setItem("pip_watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  // On mount only: declare the localStorage watchlist to the backend so it
  // can re-fetch any tickers whose in-memory state was wiped by a restart
  // (OOM, deploy). The backend ensures each ticker is in _extra_tickers
  // and fires a background fetch for any missing from _last_result.
  // Empty deps array is intentional — this MUST NOT re-fire on every
  // watchlist change; adds/removes are handled by /tickers/add individually.
  useEffect(() => {
    if (watchlist.length === 0) return;
    fetch(`${API_URL}/tickers/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers: watchlist }),
    }).catch(() => {
      // Silent fail — user can still re-add manually if the backend is down.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selected, setSelected] = useState(DEFAULT_WATCHLIST[0] ?? null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [compareSet, setCompareSet] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const watchlistFull = watchlist.length >= MAX_WATCHLIST_SIZE;

  const addTicker = useCallback(
    (raw) => {
      const sym = (raw || "").trim().toUpperCase();
      if (!sym) return;
      if (watchlist.includes(sym)) return;
      if (watchlist.length >= MAX_WATCHLIST_SIZE) {
        setToast({ id: Date.now(), message: WATCHLIST_FULL_MESSAGE });
        return;
      }
      setWatchlist((w) => {
        if (w.includes(sym) || w.length >= MAX_WATCHLIST_SIZE) return w;
        return [...w, sym];
      });
      setSelected((s) => s ?? sym);
      fetch(`${API_URL}/tickers/add?ticker=${sym}`, {
        method: "POST",
      }).catch(() => {});
      // Force fast /pulse polling so the newly-fetched ticker's data
      // surfaces within ~5 s instead of waiting up to a full slow-poll.
      bumpPulsePolling?.();
    },
    [watchlist, bumpPulsePolling]
  );

  const removeTicker = useCallback((sym) => {
    setWatchlist((w) => w.filter((t) => t !== sym));
    setCompareSet((c) => c.filter((t) => t !== sym));
    setSelected((s) => {
      if (s !== sym) return s;
      // Fall back to first remaining ticker in the watchlist.
      return null; // recalc below in effect-like memo
    });
  }, []);

  // Keep `selected` valid when watchlist changes.
  const effectiveSelected = useMemo(() => {
    if (selected && watchlist.includes(selected)) return selected;
    return watchlist[0] ?? null;
  }, [selected, watchlist]);

  const handleTickerClick = useCallback(
    (sym) => {
      // Both Compare and Relations tabs share the compareSet. A sidebar
      // click on either tab toggles ticker membership in that set; on
      // any other tab it just selects a single ticker for the Dashboard.
      if (activeTab === "compare" || activeTab === "relations") {
        // Toggle: already-selected → remove; not selected and under limit → add.
        // At limit with a non-selected ticker → silent no-op.
        setCompareSet((c) => {
          if (c.includes(sym)) return c.filter((t) => t !== sym);
          if (c.length >= MAX_COMPARE) return c;
          return [...c, sym];
        });
      } else {
        setSelected(sym);
      }
    },
    [activeTab]
  );

  const removeFromCompare = useCallback((sym) => {
    setCompareSet((c) => c.filter((t) => t !== sym));
  }, []);

  const reorderWatchlist = useCallback((fromIndex, toIndex) => {
    setWatchlist((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
      next.splice(adjustedTo, 0, moved);
      return next;
    });
  }, []);

  const submitTicker = useCallback(
    (symbol) => {
      addTicker(symbol ?? searchInput);
      setSearchInput("");
    },
    [addTicker, searchInput]
  );

  return (
    <div className="min-h-screen bg-[#F5F4F0] text-slate-900 transition-colors dark:bg-[#0B0F14] dark:text-slate-100">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onSubmitTicker={submitTicker}
        lastUpdated={lastUpdated}
      />

      <div className="flex min-h-[calc(100vh-65px)]">
        <Sidebar
          watchlist={watchlist}
          selected={effectiveSelected}
          compareSet={compareSet}
          tickersData={data}
          activeTab={activeTab}
          onTickerClick={handleTickerClick}
          onRemoveTicker={removeTicker}
          onReorder={reorderWatchlist}
        />

        <main className="min-w-0 flex-1 px-6 pt-4 pb-6">
          {error && <ErrorBanner message={error.message} />}
          {loading && <div className="text-sm text-slate-500">Loading pulse…</div>}

          {!loading && activeTab === "dashboard" && (() => {
            const items = effectiveSelected ? data?.[effectiveSelected] ?? [] : [];
            // TEMPORARY DIAGNOSTIC — remove once we confirm whether NVDA/AMZN
            // are missing from the pulse response (backend issue) or present
            // but not flowing through (frontend issue).
            // eslint-disable-next-line no-console
            console.log("[Dashboard render]", {
              selected,
              effectiveSelected,
              tickersInPulseData: Object.keys(data ?? {}),
              itemsForSelected: items,
              itemCount: items.length,
              firstItemQuadrant: items[0]?.quadrant,
            });
            return (
              <Dashboard
                ticker={effectiveSelected}
                items={items}
                addTicker={addTicker}
                watchlistFull={watchlistFull}
              />
            );
          })()}

          {!loading && activeTab === "compare" && (
            <CompareTab tickers={compareSet} onRemove={removeFromCompare} />
          )}

          {!loading && activeTab === "relations" && (
            <RelationsTab tickers={compareSet} onRemove={removeFromCompare} />
          )}

          {activeTab === "updates" && <UpdatesTab />}

        </main>
      </div>

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-lg dark:border-amber-700/60 dark:bg-amber-900/50 dark:text-amber-100"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Couldn't reach the backend ({message}). Is{" "}
      <code className="font-mono">uvicorn main:app</code> running on port 8000?
    </div>
  );
}
