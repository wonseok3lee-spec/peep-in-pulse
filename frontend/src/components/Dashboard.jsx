import { useState } from "react";
import TickerHeader from "./TickerHeader";
import TagRow from "./TagRow";
import QuadrantGrid from "./QuadrantGrid";
import TopMoversSection from "./TopMoversSection";
import { BoltIcon } from "./icons";

function DashboardLegend() {
  return (
    <div className="flex items-center gap-4 px-1 pb-2 text-[11px] text-slate-600 dark:text-slate-400">
      <div className="flex items-center gap-1.5">
        <BoltIcon className="h-3 w-3 text-[#7C3AED]" />
        <span>Surprise — unexpected news</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" />
        <span>Important</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" />
        <span>Less important</span>
      </div>
    </div>
  );
}

function SortToggle({ sortMode, onChange }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 dark:text-slate-400">Sort by</span>
      <div className="flex overflow-hidden rounded-md border border-slate-200 dark:border-zinc-700">
        <button
          type="button"
          onClick={() => onChange("priority")}
          className={`px-2.5 py-1 font-medium transition-colors ${
            sortMode === "priority"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Importance
        </button>
        <button
          type="button"
          onClick={() => onChange("recency")}
          className={`border-l border-slate-200 px-2.5 py-1 font-medium transition-colors dark:border-zinc-700 ${
            sortMode === "recency"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Recency
        </button>
      </div>
    </div>
  );
}

export default function Dashboard({ ticker, items, addTicker }) {
  const [sortMode, setSortMode] = useState("priority");

  return (
    <div className="w-full space-y-4">
      {ticker ? (
        <>
          <div className="flex items-center justify-between">
            <DashboardLegend />
            <SortToggle sortMode={sortMode} onChange={setSortMode} />
          </div>
          <TickerHeader ticker={ticker} />
          <div className="px-1">
            <TagRow items={items} />
          </div>
          <QuadrantGrid items={items} sortMode={sortMode} />
        </>
      ) : null}

      {/* Top Movers — always shown, regardless of ticker selection.
          Clicking a row adds that ticker to the watchlist (primary
          onboarding path when the watchlist is empty). */}
      <TopMoversSection onTickerClick={addTicker} />
    </div>
  );
}
