import { useScreener } from "../hooks/useScreener";

const COLUMNS = [
  { id: "day_gainers", label: "Day Gainers" },
  { id: "day_losers", label: "Day Losers" },
  { id: "undervalued_large_caps", label: "Undervalued" },
];

const ROW_LIMIT = 10;

function formatChange(c) {
  if (c == null) return "—";
  const sign = c >= 0 ? "+" : "";
  return `${sign}${c.toFixed(2)}%`;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function MoverColumn({ id, label }) {
  const { data, loading, error } = useScreener(id);
  const rows = data.slice(0, ROW_LIMIT);

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
          No data
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, i) => {
            const isPositive = row.changePct >= 0;
            return (
              <div
                key={row.ticker || i}
                className="flex items-baseline gap-2 text-xs"
              >
                <span className="w-4 shrink-0 font-mono text-slate-400">
                  {i + 1}.
                </span>
                <span className="shrink-0 font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {row.ticker}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TopMoversSection() {
  return (
    <section className="mt-6 rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-base">🔥</span>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-700 dark:text-slate-200">
          Top Movers
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-6 divide-x divide-dashed divide-slate-200 dark:divide-zinc-700">
        {COLUMNS.map((col, i) => (
          <div key={col.id} className={i > 0 ? "pl-6" : ""}>
            <MoverColumn id={col.id} label={col.label} />
          </div>
        ))}
      </div>
    </section>
  );
}
