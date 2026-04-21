import { useState } from "react";
import { useScreener } from "../hooks/useScreener";

const COLUMNS = [
  { id: "day_gainers", label: "Day Gainers" },
  { id: "day_losers", label: "Day Losers" },
  { id: "undervalued_large_caps", label: "Undervalued" },
];

const ROW_LIMIT = 10;

// Market-cap filters keep the Top Movers focused on companies the user
// is likely to recognize. Small/micro caps dominate Yahoo's raw
// day_gainers list (many are obscure biotech / SPAC / OTC names).
const CAP_FILTERS = [
  { value: "all", label: "All", threshold: 0 },
  { value: "mid", label: "Mid+ cap ($2B+)", threshold: 2e9 },
  { value: "large", label: "Large cap only ($10B+)", threshold: 10e9 },
];

function formatChange(c) {
  if (c == null) return "—";
  const sign = c >= 0 ? "+" : "";
  return `${sign}${c.toFixed(2)}%`;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function MoverColumn({ id, label, onTickerClick, capThreshold, watchlistFull }) {
  const { data, loading, error } = useScreener(id);
  // Filter BEFORE slicing to ROW_LIMIT so a strict cap filter (e.g. $10B+)
  // can still surface up to 10 qualifying names from the 25-item raw
  // screener response, not just whichever of the first 10 happened to
  // meet the threshold.
  const filtered =
    capThreshold > 0
      ? data.filter((row) => (row.marketCap || 0) >= capThreshold)
      : data;
  const rows = filtered.slice(0, ROW_LIMIT);
  // Note shown when the filter trimmed below ROW_LIMIT — clarifies for
  // the user that the short list is expected, not a data error.
  const showQualifyingNote =
    capThreshold > 0 && rows.length > 0 && rows.length < ROW_LIMIT;

  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </h3>
      {loading && rows.length === 0 ? (
        <div className="space-y-1.5">
          {Array.from({ length: ROW_LIMIT }).map((_, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              <span className="w-4 shrink-0 font-mono text-slate-300">
                {i + 1}.
              </span>
              <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-zinc-700" />
              <div className="h-3 min-w-0 flex-1 animate-pulse rounded bg-slate-100 dark:bg-zinc-800" />
              <div className="h-3 w-12 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-zinc-700" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-6 text-center text-xs italic text-red-400">
          Failed to load
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs italic text-slate-400">
          {capThreshold > 0 ? "No names meet this market-cap filter." : "No data"}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {rows.map((row, i) => {
              const isPositive = row.changePct >= 0;
              return (
                <button
                  key={row.ticker || i}
                  type="button"
                  onClick={() => onTickerClick?.(row.ticker)}
                  disabled={watchlistFull}
                  title={
                    watchlistFull
                      ? "Watchlist is full — remove a ticker to add a new one."
                      : undefined
                  }
                  className={`group -mx-1 flex w-full items-baseline gap-2 rounded px-1 py-1 text-left text-xs transition-colors ${
                    watchlistFull
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="w-4 shrink-0 font-mono text-slate-400">
                    {i + 1}.
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {row.ticker}
                  </span>
                  <span className="hidden shrink-0 font-mono text-[10px] font-medium tracking-wide text-violet-600 group-hover:inline dark:text-violet-400">
                    + ADD
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">
                    {truncate(row.name, 24)}
                  </span>
                  <span
                    className={`shrink-0 font-mono font-semibold ${
                      isPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500 dark:text-red-400"
                    }`}
                  >
                    {formatChange(row.changePct)}
                  </span>
                </button>
              );
            })}
          </div>
          {showQualifyingNote && (
            <p className="mt-2 text-[10px] italic text-slate-400 dark:text-slate-500">
              Showing {rows.length} qualifying name{rows.length === 1 ? "" : "s"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function TopMoversSection({ onTickerClick, watchlistFull }) {
  const [capFilter, setCapFilter] = useState("all");
  const activeFilter =
    CAP_FILTERS.find((f) => f.value === capFilter) ?? CAP_FILTERS[0];

  return (
    <section className="mt-6 rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-base">🔥</span>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-700 dark:text-slate-200">
          Top Movers
        </h2>
        <label className="ml-4 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-medium uppercase tracking-wide">Filter</span>
          <select
            value={capFilter}
            onChange={(e) => setCapFilter(e.target.value)}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-200 dark:focus:ring-violet-700"
          >
            {CAP_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-6 divide-x divide-dashed divide-slate-200 dark:divide-zinc-700">
        {COLUMNS.map((col, i) => (
          <div key={col.id} className={i > 0 ? "pl-6" : ""}>
            <MoverColumn
              id={col.id}
              label={col.label}
              onTickerClick={onTickerClick}
              capThreshold={activeFilter.threshold}
              watchlistFull={watchlistFull}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
