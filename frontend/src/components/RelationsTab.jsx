import { useMemo, useState } from "react";
import { isForeignTicker, TickerChip } from "./CompareTab";
import { PERIODS } from "../hooks/useCompareData";
import { TICKER_COLORS } from "../lib/colors";
import ReturnView from "./ReturnView";
import ValuationView from "./ValuationView";
import { GrowthView } from "./GrowthView";
import { RiskView } from "./RiskView";

/**
 * RelationsTab — 2x2 grid showing all 4 Compare sub-views simultaneously
 * for the same ticker set. Period selector is shared across the grid;
 * ticker list flows in from the parent's compareSet (same source as
 * CompareTab uses).
 *
 * Each sub-view self-fetches via its own hooks (useCompareData,
 * useFundamentals, etc.). The backend's _chart_cache absorbs duplicate
 * /proxy/chart fetches between ReturnView and RiskView when both are
 * active.
 *
 * Period state is local to RelationsTab — switching to Compare and back
 * does not preserve it. User-accepted trade-off vs lifting state to App.
 *
 * Custom date range, benchmark line, and price/pct toggle are NOT exposed
 * here — Relations stays simple. ReturnView falls back to its defaults
 * (pct mode, no benchmark) for the cell.
 */
export default function RelationsTab({ tickers, onRemove }) {
  const [periodKey, setPeriodKey] = useState("1Y");

  const usdTickers = useMemo(
    () => tickers.filter((t) => !isForeignTicker(t)),
    [tickers]
  );
  const foreignCount = tickers.length - usdTickers.length;

  return (
    <div className="w-full space-y-4">
      {/* Header card: title + period selector + chip row.
          Sticky-pinned 65 px below the top (matching the Sidebar's
          existing top offset) so users can scroll the 2x2 grid while
          keeping period/ticker controls in reach. Solid bg matches
          Sidebar's pattern — earlier 95% opacity with backdrop-blur let
          scrolled chart content faintly show through, and the frosted-
          glass aesthetic wasn't worth the data-readability cost. z-10
          sits above grid cells (z-auto) and below the navbar (z-20). */}
      <div className="sticky top-[65px] z-10 rounded-xl border border-slate-100 bg-white px-5 py-3 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
        {/* Row 1: title + period buttons */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-2 dark:border-zinc-700/50">
          <h2 className="shrink-0 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Relations
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriodKey(p.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  periodKey === p.key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {p.key}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: ticker chips — full list including foreign (which the
            views internally exclude). */}
        {tickers.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tickers.map((t, i) => (
              <TickerChip
                key={t}
                ticker={t}
                color={TICKER_COLORS[i % TICKER_COLORS.length]}
                onRemove={() => onRemove(t)}
                disabled={isForeignTicker(t)}
              />
            ))}
          </div>
        )}
        {foreignCount > 0 && (
          <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
            {foreignCount} foreign ticker{foreignCount > 1 ? "s" : ""} excluded — compare in Dashboard for those
          </p>
        )}
      </div>

      {/* Empty-state card OR 2x2 grid */}
      {usdTickers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm italic text-slate-400 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
          {foreignCount > 0
            ? "Foreign tickers can't be compared here — use Dashboard."
            : "Click tickers in the sidebar to add them to Relations."}
        </div>
      ) : (
        // Single column on narrow viewports, 2x2 grid at lg (≥1024 px).
        // Each cell is a Card wrapper — same px/py/border/shadow as the
        // Compare-tab view cards, with a small uppercase label so users
        // can orient at a glance even when the chart's own header is
        // suppressed by compact mode.
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card label="% Return">
            <ReturnView tickers={usdTickers} periodKey={periodKey} compact />
          </Card>
          <Card label="Valuation (Snapshot)">
            <ValuationView tickers={usdTickers} compact />
          </Card>
          <Card label="Growth (Snapshot)">
            <GrowthView tickers={usdTickers} compact />
          </Card>
          <Card label="Risk vs Return">
            <RiskView tickers={usdTickers} periodKey={periodKey} compact />
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({ label, children }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-6 py-5 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </h3>
      {children}
    </div>
  );
}
