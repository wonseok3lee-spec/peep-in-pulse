import { useCallback, useEffect, useMemo, useState } from "react";
import { usePulse } from "./hooks/usePulse";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import CompareTab from "./components/CompareTab";
import { MAX_COMPARE } from "./lib/colors";
import { API_URL } from "./lib/api";

const DEFAULT_WATCHLIST = [];
const MAX_WATCHLIST = 10;

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

  const [selected, setSelected] = useState(DEFAULT_WATCHLIST[0] ?? null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [compareSet, setCompareSet] = useState([]);
  const [searchInput, setSearchInput] = useState("");

  const addTicker = useCallback(
    (raw) => {
      const sym = (raw || "").trim().toUpperCase();
      if (!sym) return;
      setWatchlist((w) => {
        if (w.includes(sym) || w.length >= MAX_WATCHLIST) return w;
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
    [bumpPulsePolling]
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
      if (activeTab === "compare") {
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

        <main className="min-w-0 flex-1 p-6">
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
              />
            );
          })()}

          {!loading && activeTab === "compare" && (
            <CompareTab tickers={compareSet} onRemove={removeFromCompare} />
          )}

        </main>
      </div>
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
