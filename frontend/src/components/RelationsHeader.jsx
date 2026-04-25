import { isForeignTicker, TickerChip } from "./CompareTab";
import { PERIODS } from "../hooks/useCompareData";
import { TICKER_COLORS } from "../lib/colors";

/**
 * RelationsHeader — sticky control bar for the Relations tab.
 *
 * Lives in App.jsx as a sibling of <main> (inside a flex-col wrapper)
 * so its sticky position context matches Sidebar's depth — when the
 * header was nested deeper inside <main>, sticky was silently failing
 * (header scrolled away with content). Hoisting it one level up,
 * mirroring Sidebar's structural depth, restores correct pinning.
 *
 * State (periodKey) is owned by App so it survives tab switches and
 * can be read by RelationsTab without prop-drilling through the
 * grid.
 */
export default function RelationsHeader({
  tickers,
  onRemove,
  periodKey,
  setPeriodKey,
}) {
  const foreignCount = tickers.filter(isForeignTicker).length;

  return (
    <div className="sticky top-[65px] z-10 mx-6 mt-4 rounded-xl border border-slate-100 bg-white px-5 py-3 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
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
  );
}
