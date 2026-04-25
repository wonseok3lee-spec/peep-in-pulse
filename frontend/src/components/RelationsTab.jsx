import { useMemo } from "react";
import { isForeignTicker } from "./CompareTab";
import ReturnView from "./ReturnView";
import ValuationView from "./ValuationView";
import { GrowthView } from "./GrowthView";
import { RiskView } from "./RiskView";

/**
 * RelationsTab — 2x2 grid of all 4 Compare sub-views for the same
 * ticker set.
 *
 * The sticky control bar (title + period selector + ticker chips)
 * lives in App.jsx as RelationsHeader — hoisted out of here so its
 * sticky position context matches Sidebar's depth-1 from the flex
 * container. Sticky was silently failing when the header was nested
 * deeper inside <main>.
 *
 * periodKey is owned by App and passed in. Each sub-view self-fetches
 * via its own hooks; the backend's _chart_cache absorbs duplicate
 * /proxy/chart calls between ReturnView and RiskView.
 *
 * Custom date range, benchmark line, and price/pct toggle are NOT
 * exposed here — Relations stays simple. ReturnView falls back to its
 * defaults (pct mode, no benchmark) for the cell.
 */
export default function RelationsTab({ tickers, periodKey }) {
  const usdTickers = useMemo(
    () => tickers.filter((t) => !isForeignTicker(t)),
    [tickers]
  );
  const foreignCount = tickers.length - usdTickers.length;

  if (usdTickers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm italic text-slate-400 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
        {foreignCount > 0
          ? "Foreign tickers can't be compared here — use Dashboard."
          : "Click tickers in the sidebar to add them to Relations."}
      </div>
    );
  }

  // Single column on narrow viewports, 2x2 grid at lg (≥1024 px).
  // Each cell is a Card wrapper with a small uppercase label so users
  // can orient at a glance even when the chart's own header is
  // suppressed by compact mode.
  return (
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
