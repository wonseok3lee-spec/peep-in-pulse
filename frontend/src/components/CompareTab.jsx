import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PERIODS, useCompareData } from "../hooks/useCompareData";
import { MAX_COMPARE, TICKER_COLORS } from "../lib/colors";
import ValuationView from "./ValuationView";
import { RiskView } from "./RiskView";
import { GrowthView } from "./GrowthView";

const VIEWS = [
  { key: "return", label: "% Return" },
  { key: "valuation", label: "Valuation" },
  { key: "growth", label: "Growth" },
  { key: "risk", label: "Risk" },
];

const BENCHMARKS = [
  { key: "none", label: "None", symbol: null },
  { key: "spy", label: "SPY", symbol: "SPY" },
  { key: "qqq", label: "QQQ", symbol: "QQQ" },
  { key: "dia", label: "DIA", symbol: "DIA" },
];

// Yahoo Finance suffixes a dot + exchange code for non-USD listings
// (e.g. 047810.KS, 8306.T, TSCO.L). The Compare tab can only meaningfully
// chart USD-denominated data together, so foreign tickers are filtered out
// of every Compare computation. They remain fully active in Dashboard.
export const isForeignTicker = (t) => t.includes(".");

// Date display is MM-DD-YYYY (US) in the UI; ISO (YYYY-MM-DD) everywhere
// downstream (state, backend, chart). These helpers bridge the two forms
// and reject impossible calendar dates (e.g. 02-31, 13-01).
function usToIso(usDate) {
  if (!usDate) return null;
  const m = usDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().split("T")[0] !== iso) return null;
  return iso;
}

function isoToUs(isoDate) {
  if (!isoDate) return "";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const [, yyyy, mm, dd] = m;
  return `${mm}-${dd}-${yyyy}`;
}

// Auto-insert hyphens after the 2nd and 4th digits so typing "04172026"
// renders as "04-17-2026". Pastes of an already-formatted value stay
// correctly formatted; non-digits are stripped.
function formatUsDateInput(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export default function CompareTab({ tickers, onRemove }) {
  const [viewKey, setViewKey] = useState("return"); // "return" | "valuation"
  const [periodKey, setPeriodKey] = useState("1Y");
  const [viewMode, setViewMode] = useState("pct"); // "pct" | "price"
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);
  // Raw MM-DD-YYYY text shown in the inputs. Diverges from customStart/
  // customEnd (which stay null) while the user is typing a partial or
  // invalid date, so they can see and correct their own input.
  const [customStartInput, setCustomStartInput] = useState(
    isoToUs(customStart)
  );
  const [customEndInput, setCustomEndInput] = useState(isoToUs(customEnd));
  const [benchmarkKey, setBenchmarkKey] = useState("none");
  const selectedBenchmark = BENCHMARKS.find((b) => b.key === benchmarkKey);
  const isCustomActive = !!(customStart && customEnd);
  const customRange = isCustomActive
    ? { start: customStart, end: customEnd }
    : null;

  // Only USD tickers participate in Compare computations. Foreign tickers
  // still appear in the chip row (dimmed), but every chart, legend, recap,
  // and child view receives usdTickers instead.
  const usdTickers = useMemo(
    () => tickers.filter((t) => !isForeignTicker(t)),
    [tickers]
  );
  const foreignCount = tickers.length - usdTickers.length;

  const { data: history, benchmark, loading, usingMock } = useCompareData(
    usdTickers,
    periodKey,
    customRange,
    selectedBenchmark?.symbol || null
  );

  const chartData = useMemo(
    () => buildChartData(usdTickers, history, viewMode, benchmark),
    [usdTickers, history, viewMode, benchmark]
  );
  const periodReturns = useMemo(
    () => computePeriodReturns(usdTickers, history),
    [usdTickers, history]
  );
  const lastTs = useMemo(() => {
    let max = 0;
    for (const v of Object.values(history)) {
      const last = v?.points?.[v.points.length - 1]?.ts;
      if (last && last > max) max = last;
    }
    return max || null;
  }, [history]);
  const lastDate = lastTs ? new Date(lastTs * 1000) : null;
  const isStale =
    lastDate && Date.now() - lastDate.getTime() > 18 * 60 * 60 * 1000;
  const showLastCloseHint = isStale && periodKey === "1D" && !isCustomActive;

  const currentPrices = useMemo(() => {
    const out = {};
    for (const t of usdTickers) {
      const pts = history[t]?.points ?? [];
      out[t] = pts.length ? pts[pts.length - 1].close : null;
    }
    return out;
  }, [usdTickers, history]);

  return (
    <div className="w-full space-y-4">
      {/* Header card: title + view tabs + chips inline */}
      <div className="rounded-xl border border-slate-100 bg-white px-5 py-3 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
        {/* Row 1: Compare title + view tabs */}
        <div className="flex items-center gap-6 border-b border-slate-200 dark:border-zinc-700/50">
          <h2 className="shrink-0 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Compare
          </h2>

          <div className="flex gap-4">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setViewKey(v.key)}
                className={`-mb-[2px] border-b-2 px-2 py-1 text-sm font-medium transition-colors ${
                  viewKey === v.key
                    ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: ticker chips — dedicated line so 10 chips always fit */}
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

        {(viewKey === "return" || viewKey === "risk") && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setPeriodKey(p.key);
                    setCustomStart(null);
                    setCustomEnd(null);
                    setCustomStartInput("");
                    setCustomEndInput("");
                  }}
                  disabled={isCustomActive}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isCustomActive
                      ? "cursor-not-allowed border border-slate-100 bg-slate-50 text-slate-300 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-slate-600"
                      : periodKey === p.key
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {p.key}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 dark:border-zinc-700">
              <input
                type="text"
                inputMode="numeric"
                placeholder="MM-DD-YYYY"
                pattern="\d{2}-\d{2}-\d{4}"
                maxLength={10}
                value={customStartInput}
                onChange={(e) => {
                  const formatted = formatUsDateInput(e.target.value);
                  setCustomStartInput(formatted);
                  if (formatted === "") {
                    setCustomStart(null);
                  } else {
                    const iso = usToIso(formatted);
                    setCustomStart(iso); // null if invalid/partial
                  }
                }}
                className={`w-[110px] rounded-md border px-2 py-1 font-mono text-xs ${
                  isCustomActive
                    ? "border-slate-900 bg-white font-medium text-slate-900 dark:border-slate-100 dark:bg-zinc-800 dark:text-slate-100"
                    : "border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-400"
                }`}
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="MM-DD-YYYY"
                pattern="\d{2}-\d{2}-\d{4}"
                maxLength={10}
                value={customEndInput}
                onChange={(e) => {
                  const formatted = formatUsDateInput(e.target.value);
                  setCustomEndInput(formatted);
                  if (formatted === "") {
                    setCustomEnd(null);
                  } else {
                    const iso = usToIso(formatted);
                    setCustomEnd(iso);
                  }
                }}
                className={`w-[110px] rounded-md border px-2 py-1 font-mono text-xs ${
                  isCustomActive
                    ? "border-slate-900 bg-white font-medium text-slate-900 dark:border-slate-100 dark:bg-zinc-800 dark:text-slate-100"
                    : "border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-400"
                }`}
              />
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const yyyy = today.getFullYear();
                  const mm = String(today.getMonth() + 1).padStart(2, "0");
                  const dd = String(today.getDate()).padStart(2, "0");
                  const iso = `${yyyy}-${mm}-${dd}`;
                  setCustomEnd(iso);
                  setCustomEndInput(isoToUs(iso));
                }}
                className="ml-1 flex h-7 items-center justify-center rounded-md border border-violet-300 bg-violet-50 px-2.5 text-xs font-medium text-violet-600 transition-all hover:border-violet-500 hover:bg-violet-500 hover:text-white dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-500 dark:hover:text-white"
                title="Set end date to today"
                aria-label="Set end date to today"
              >
                Now
              </button>
              {isCustomActive && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStart(null);
                    setCustomEnd(null);
                    setCustomStartInput("");
                    setCustomEndInput("");
                  }}
                  className="ml-2 flex h-7 w-7 items-center justify-center rounded-full border border-violet-300 bg-violet-50 text-violet-600 shadow-[0_0_10px_rgba(124,58,237,0.35)] transition-all hover:border-violet-500 hover:bg-violet-500 hover:text-white hover:shadow-[0_0_16px_rgba(124,58,237,0.6)] dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-500 dark:hover:text-white"
                  title="Clear custom range and return to period buttons"
                  aria-label="Clear custom date range"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {viewKey === "return" && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              {/* View as */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  View as
                </span>
                <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setViewMode("pct")}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      viewMode === "pct"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    % return
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("price")}
                    className={`border-l border-slate-200 px-3 py-1 text-xs font-medium transition-colors dark:border-zinc-700 ${
                      viewMode === "price"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    Price ($)
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700" />

              {/* Compare vs */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Compare vs
                </span>
                <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-700">
                  {BENCHMARKS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBenchmarkKey(b.key)}
                      className={`border-l border-slate-200 px-2.5 py-1 text-xs font-medium transition-colors first:border-l-0 dark:border-zinc-700 ${
                        benchmarkKey === b.key
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contextual hint */}
              <span className="ml-auto text-xs italic text-slate-400 dark:text-slate-500">
                {viewMode === "pct"
                  ? "normalized from period start"
                  : "actual price ($)"}
                {benchmarkKey !== "none" && " · market baseline dashed"}
              </span>
            </div>

            {usingMock && (
              <p className="mt-3 text-xs italic text-slate-500">
                Using sample data — Yahoo Finance couldn't be reached.
              </p>
            )}
          </>
        )}
      </div>

      {viewKey === "return" ? (
        <div className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
          {showLastCloseHint && (
            <p className="mb-2 text-xs italic text-slate-400">
              Showing last trading session —{" "}
              {lastDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}

          <div className="grid grid-cols-[1fr_340px] gap-4">
            {/* LEFT: chart only */}
            <div className="min-w-0">
              <div className="w-full caret-transparent outline-none" style={{ height: 440 }}>
                {usdTickers.length === 0 ? (
                  <EmptyState foreignOnly={tickers.length > 0} />
                ) : loading ? (
                  <Skeleton />
                ) : (
                  <ChartView
                    chartData={chartData}
                    tickers={usdTickers}
                    periodKey={periodKey}
                    viewMode={viewMode}
                    benchmark={benchmark}
                    isCustomActive={isCustomActive}
                  />
                )}
              </div>
            </div>

            {/* RIGHT: period recap + vertical legend + vs-benchmark (when active) */}
            <div className="min-w-0 border-l border-slate-100 pl-4 dark:border-zinc-700/50">
              {(() => {
                const validReturns = usdTickers
                  .map((t) => ({ ticker: t, pct: periodReturns[t] }))
                  .filter((x) => x.pct != null);
                if (validReturns.length === 0) return null;
                const sorted = [...validReturns].sort((a, b) => b.pct - a.pct);
                const best = sorted[0];
                const worst = sorted[sorted.length - 1];
                const spread = best.pct - worst.pct;
                return (
                  <div className="mb-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Period recap ({
                        isCustomActive
                          ? `${customStartInput} to ${customEndInput}`
                          : periodKey
                      })
                    </p>
                    <div className="space-y-1 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs dark:border-zinc-700/50 dark:bg-zinc-800/50">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">
                          Best
                        </span>
                        <span
                          className={`font-mono ${
                            best.pct >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <span className="font-semibold">{best.ticker}</span>{" "}
                          {best.pct >= 0 ? "+" : ""}
                          {best.pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">
                          Worst
                        </span>
                        <span
                          className={`font-mono ${
                            worst.pct < 0
                              ? "text-red-500 dark:text-red-400"
                              : "text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <span className="font-semibold">{worst.ticker}</span>{" "}
                          {worst.pct >= 0 ? "+" : ""}
                          {worst.pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">
                          Spread
                        </span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {spread.toFixed(1)} %p
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {usdTickers.length === 0 ? (
                <span className="text-xs italic text-slate-400">
                  {tickers.length === 0
                    ? "No tickers selected."
                    : "Foreign tickers can't be compared here — use Dashboard."}
                </span>
              ) : (
                <>
                  {viewMode === "pct" && benchmark && benchmark.points?.length > 1 && (
                    <p className="mb-1 text-[10px] italic text-slate-400 dark:text-slate-500">
                      Δ = ticker return minus {benchmark.symbol} return
                    </p>
                  )}
                  <div className="space-y-1 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs dark:border-zinc-700/50 dark:bg-zinc-800/50">
                  {(() => {
                    // Benchmark period return — computed once, reused per row
                    let bReturn = null;
                    if (benchmark && benchmark.points?.length >= 2) {
                      const bPts = benchmark.points;
                      const bFirst = bPts[0].close;
                      const bLast = bPts[bPts.length - 1].close;
                      bReturn = bFirst ? ((bLast - bFirst) / bFirst) * 100 : null;
                    }
                    return usdTickers.map((t, i) => {
                      const color = TICKER_COLORS[i % TICKER_COLORS.length];
                      const pct = periodReturns[t];
                      const price = currentPrices[t];
                      const hasData = (history[t]?.points?.length ?? 0) > 1;
                      const delta = pct != null && bReturn != null ? pct - bReturn : null;
                      const pctColor =
                        pct == null
                          ? "text-slate-400 dark:text-slate-500"
                          : pct >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-500 dark:text-red-400";
                      const deltaColor =
                        delta == null
                          ? "text-slate-400 dark:text-slate-500"
                          : delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-500 dark:text-red-400";
                      return (
                        <div
                          key={t}
                          className={`flex items-center gap-1.5 whitespace-nowrap font-mono text-xs ${
                            !hasData ? "opacity-50" : ""
                          }`}
                          title={t}
                        >
                          <span
                            aria-hidden="true"
                            className="inline-block h-[3px] w-3 shrink-0 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {t.split(".")[0]}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {price != null ? `$${price.toFixed(2)}` : "--"}
                          </span>
                          {viewMode === "pct" && (
                            <span className={`font-semibold ${pctColor}`}>
                              {pct == null
                                ? "--"
                                : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                            </span>
                          )}
                          {viewMode === "pct" && benchmark && delta != null && (
                            <span className="ml-auto flex items-center gap-1">
                              <span className="text-slate-400 dark:text-slate-500">
                                Δ {benchmark.symbol}
                              </span>
                              <span className={`font-semibold ${deltaColor}`}>
                                {delta >= 0 ? "+" : ""}
                                {delta.toFixed(1)}%
                              </span>
                            </span>
                          )}
                        </div>
                      );
                    });
                  })()}
                  {viewMode === "pct" && benchmark && benchmark.points?.length > 1 && (() => {
                    const bPts = benchmark.points;
                    const bFirst = bPts[0]?.close;
                    const bLast = bPts[bPts.length - 1]?.close;
                    const bReturn = bFirst ? ((bLast - bFirst) / bFirst) * 100 : 0;
                    const valueColor =
                      bReturn >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500 dark:text-red-400";
                    return (
                      <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap border-t border-slate-200 pt-1 font-mono text-xs dark:border-zinc-700">
                        <span
                          aria-hidden="true"
                          className="inline-block h-[2px] w-4 shrink-0 border-t-2 border-dashed border-slate-400 dark:border-slate-500"
                        />
                        <span className="font-semibold text-slate-500 dark:text-slate-400">
                          {benchmark.symbol}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {bLast != null ? `$${bLast.toFixed(2)}` : "--"}
                        </span>
                        <span className={`font-semibold ${valueColor}`}>
                          {`${bReturn >= 0 ? "+" : ""}${bReturn.toFixed(2)}%`}
                        </span>
                      </div>
                    );
                  })()}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : viewKey === "valuation" ? (
        <div className="rounded-xl border border-slate-100 bg-white px-6 py-5 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
          {usdTickers.length === 0 ? (
            <EmptyState foreignOnly={tickers.length > 0} />
          ) : (
            <ValuationView tickers={usdTickers} />
          )}
        </div>
      ) : viewKey === "growth" ? (
        <div className="rounded-xl border border-slate-100 bg-white px-6 py-5 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
          {usdTickers.length === 0 ? (
            <EmptyState foreignOnly={tickers.length > 0} />
          ) : (
            <GrowthView tickers={usdTickers} />
          )}
        </div>
      ) : viewKey === "risk" ? (
        <div className="rounded-xl border border-slate-100 bg-white px-6 py-5 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
          {usdTickers.length === 0 ? (
            <EmptyState foreignOnly={tickers.length > 0} />
          ) : (
            <RiskView tickers={usdTickers} periodKey={periodKey} />
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Chart  ------------------------------ */

// Endpoint dot + value label for the Compare chart. Mirrors the Sparkline's
// layered-circle glow: halo (r=7, 22% opacity) + mid (r=4.5, 50%) + core
// (r=3, solid). Rendered as an SVG group so it composes with Recharts'
// natively-scaled SVG (no preserveAspectRatio stretching to worry about
// here — that workaround was specific to the Sidebar sparkline's squashed
// viewBox). Label color follows currentColor so it picks up the slate/zinc
// text tones via Tailwind dark-mode classes.
function EndpointDot({ cx, cy, color, label, side }) {
  if (cx == null || cy == null) return null;
  const labelX = side === "right" ? cx + 6 : cx - 6;
  const anchor = side === "right" ? "start" : "end";
  return (
    <g pointerEvents="none" className="text-slate-700 dark:text-zinc-300">
      <circle cx={cx} cy={cy} r={7} fill={color} opacity={0.22} />
      <circle cx={cx} cy={cy} r={4.5} fill={color} opacity={0.5} />
      <circle cx={cx} cy={cy} r={3} fill={color} />
      {label && (
        <text
          x={labelX}
          y={cy - 8}
          textAnchor={anchor}
          fontSize={11}
          fontWeight={600}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill="currentColor"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ChartView({ chartData, tickers, periodKey, viewMode, benchmark, isCustomActive }) {
  // When a custom date range is active, periodKey is stale (still holds
  // the last-clicked button's value). Custom ranges always span full
  // dates, never intraday, so force isIntraday off in that case.
  const isIntraday =
    !isCustomActive && (periodKey === "1D" || periodKey === "5D");
  // For custom ranges, pick month/year formatting only when the span is
  // wider than ~2 years; shorter custom ranges use month/day like 1Y/6M.
  const useMonthYear = (() => {
    if (isCustomActive && chartData.length >= 2) {
      const first = chartData[0].date;
      const last = chartData[chartData.length - 1].date;
      const spanDays =
        (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
      return spanDays > 730;
    }
    return periodKey === "5Y" || periodKey === "Max";
  })();

  const formatX = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isIntraday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (useMonthYear) {
      return d.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatY = (v) => {
    if (v == null || Number.isNaN(v)) return "";
    if (viewMode === "price") return `$${v.toFixed(0)}`;
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(1)}%`;
  };

  // Zero-aware formatter for the LEFT axis so 0 always renders as "$0" / "0.0%"
  // (avoids "+0.0%" from the default formatter).
  const formatYLeft = (v) => {
    if (v === 0) return viewMode === "price" ? "$0" : "0.0%";
    return formatY(v);
  };

  // Build an explicit 5-tick array that always includes 0 on the LEFT axis.
  // This guarantees the 0% / $0 baseline is labeled even when data stays far
  // from zero, pairing with the ReferenceLine for a clear reference point.
  const allValues = [];
  for (const row of chartData) {
    for (const t of tickers) {
      if (row[t] != null && !Number.isNaN(row[t])) allValues.push(row[t]);
    }
    if (row.__benchmark__ != null && !Number.isNaN(row.__benchmark__)) {
      allValues.push(row.__benchmark__);
    }
  }
  const dataMin = allValues.length ? Math.min(...allValues) : 0;
  const dataMax = allValues.length ? Math.max(...allValues) : 0;
  const yMin = Math.min(0, dataMin);
  const yMax = Math.max(0, dataMax);
  let yTicks;
  if (yMin < 0 && yMax > 0) {
    yTicks = [yMin, yMin / 2, 0, yMax / 2, yMax];
  } else if (yMax > 0) {
    yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax];
  } else if (yMin < 0) {
    yTicks = [yMin, (3 * yMin) / 4, yMin / 2, yMin / 4, 0];
  } else {
    yTicks = [0];
  }
  const yDomain = [yMin, yMax];

  const data = chartData.map((row) => ({
    ...row,
    __xkey: row.date.toISOString(),
  }));

  // First and last indices with non-null data per ticker. Used by the dot
  // callbacks on each Line so only the endpoints get a glowing marker +
  // value label, not every plotted point. Recomputed only when shape
  // changes — keeps render cheap on resize/tooltip-hover.
  const endpointIndices = useMemo(() => {
    const out = {};
    for (const t of tickers) {
      let first = null;
      let last = null;
      for (let i = 0; i < chartData.length; i++) {
        const v = chartData[i][t];
        if (v != null && !Number.isNaN(v)) {
          if (first === null) first = i;
          last = i;
        }
      }
      out[t] = { first, last };
    }
    return out;
  }, [tickers, chartData]);

  const formatEndpointLabel = (v) => {
    if (v == null || Number.isNaN(v)) return "";
    if (viewMode === "price") return `$${v.toFixed(2)}`;
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 48, bottom: 8, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#cbd5e1"
          strokeOpacity={0.5}
          vertical
        />
        <XAxis
          dataKey="__xkey"
          stroke="#94a3b8"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          tickFormatter={formatX}
          minTickGap={28}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke="#94a3b8"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          tickFormatter={formatY}
          domain={yDomain}
          width={56}
        />
        <YAxis
          yAxisId="left"
          orientation="left"
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          tickFormatter={formatYLeft}
          ticks={yTicks}
          domain={yDomain}
          width={56}
        />
        <ReferenceLine
          yAxisId="right"
          y={0}
          stroke="#64748b"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        <Tooltip
          isAnimationActive={false}
          animationDuration={0}
          cursor={{
            stroke: "#94a3b8",
            strokeDasharray: "3 3",
            strokeWidth: 1,
          }}
          wrapperStyle={{ outline: "none" }}
          content={
            <CustomTooltip
              isIntraday={isIntraday}
              useMonthYear={useMonthYear}
              viewMode={viewMode}
              tickers={tickers}
              tickerColors={TICKER_COLORS}
              benchmark={benchmark}
            />
          }
        />
        {tickers.map((t, i) => {
          const color = TICKER_COLORS[i % TICKER_COLORS.length];
          const eps = endpointIndices[t] || {};
          return (
            <Line
              key={t}
              yAxisId="right"
              type="monotone"
              dataKey={t}
              stroke={color}
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, index, value } = props;
                if (cx == null || cy == null || value == null) return null;
                if (index !== eps.first && index !== eps.last) return null;
                const isStart = index === eps.first;
                return (
                  <EndpointDot
                    key={`endpoint-${t}-${index}`}
                    cx={cx}
                    cy={cy}
                    color={color}
                    label={formatEndpointLabel(value)}
                    side={isStart ? "right" : "left"}
                  />
                );
              }}
              isAnimationActive={false}
              connectNulls
            />
          );
        })}
        {benchmark && benchmark.points?.length > 0 && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="__benchmark__"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            name={benchmark.symbol}
            isAnimationActive={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  isIntraday,
  useMonthYear,
  viewMode,
  tickers,
  tickerColors,
  benchmark,
}) {
  if (!active || !payload?.length) return null;

  const d = new Date(label);
  let dateLabel;
  if (isIntraday) {
    dateLabel = d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } else if (useMonthYear) {
    dateLabel = d.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  } else {
    dateLabel = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  }

  // Build a quick lookup so we can show "—" for tickers with no data at this timestamp.
  const payloadMap = {};
  for (const entry of payload) payloadMap[entry.dataKey] = entry;

  const formatValue = (v) =>
    viewMode === "price"
      ? `$${v.toFixed(2)}`
      : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  const benchEntry = payloadMap.__benchmark__;

  return (
    <div
      className="min-w-[180px] rounded-lg border px-3 py-2 shadow-[0_0_20px_rgba(124,58,237,0.2)] dark:border-violet-500 dark:bg-zinc-900/98"
      style={{
        background: "rgba(255, 255, 255, 0.98)",
        borderColor: "#C4B5FD",
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
      }}
    >
      <div className="mb-1.5 border-b border-slate-100 pb-1 text-[11px] font-semibold text-slate-700 dark:border-zinc-700 dark:text-slate-300">
        {dateLabel}
      </div>
      <div className="space-y-0.5">
        {(tickers ?? []).map((t, i) => {
          const entry = payloadMap[t];
          const v = entry?.value;
          const hasValue = v != null;
          const color = tickerColors
            ? tickerColors[i % tickerColors.length]
            : entry?.color;
          const valueColor = !hasValue
            ? "text-slate-400 dark:text-slate-500"
            : v >= 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-500 dark:text-red-400";
          return (
            <div
              key={t}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {t}
                </span>
              </div>
              <span className={`font-mono font-semibold ${valueColor}`}>
                {hasValue ? formatValue(v) : "—"}
              </span>
            </div>
          );
        })}
        {benchmark && benchEntry && benchEntry.value != null && (
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-1 text-xs dark:border-zinc-700">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-[2px] w-4 border-t-2 border-dashed border-slate-400"
              />
              <span className="font-mono font-medium text-slate-500 dark:text-slate-400">
                {benchmark.symbol}
              </span>
            </div>
            <span
              className={`font-mono font-semibold ${
                benchEntry.value >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500 dark:text-red-400"
              }`}
            >
              {formatValue(benchEntry.value)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------- Header / chips / controls -------------------------- */

function TickerChip({ ticker, color, onRemove, disabled = false }) {
  // Compact translucent chip. Alpha "15"/"60" for bg/border.
  // Truncate the symbol to 4 chars and surface the exchange suffix as a
  // tiny inline badge so foreign tickers (047810.KS, 8306.T) stay readable.
  // When disabled (foreign in Compare tab): dim + strikethrough the symbol
  // but keep suffix badge and × button clean via no-underline.
  const [symbol, suffix] = ticker.split(".");
  const displaySymbol = symbol;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        disabled ? "opacity-50 line-through" : ""
      }`}
      style={{
        backgroundColor: color + "15",
        borderColor: color + "60",
        color,
      }}
      title={
        disabled
          ? `${ticker} — foreign ticker, compare only in Dashboard`
          : ticker
      }
    >
      <span>{displaySymbol}</span>
      {suffix && (
        <span className="text-[8px] uppercase opacity-60 no-underline">
          {suffix}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${ticker}`}
        className="ml-0.5 text-sm leading-none no-underline opacity-50 hover:opacity-100"
      >
        ×
      </button>
    </span>
  );
}


/* --------------------- helpers + empty/loading states --------------------- */

function buildChartData(tickers, history, viewMode, benchmark) {
  const firstCloses = {};
  for (const t of tickers) {
    const points = history[t]?.points ?? [];
    firstCloses[t] = points.length ? points[0].close : null;
  }
  const byTs = new Map();
  for (const t of tickers) {
    const points = history[t]?.points ?? [];
    const first = firstCloses[t];
    if (!first) continue;
    for (const p of points) {
      // "pct": normalize to % return from period start (fair comparison).
      // "price": raw close so stocks in the same dollar range can be read
      // directly — useful when comparing e.g. MSFT vs ORCL at similar prices.
      const value =
        viewMode === "price"
          ? p.close
          : ((p.close - first) / first) * 100;
      const row = byTs.get(p.ts) ?? { ts: p.ts, date: p.date };
      row[t] = value;
      byTs.set(p.ts, row);
    }
  }
  if (benchmark?.points?.length) {
    const benchFirst = benchmark.points[0].close;
    for (const p of benchmark.points) {
      const row = byTs.get(p.ts) ?? { ts: p.ts, date: p.date };
      row.__benchmark__ =
        viewMode === "price"
          ? p.close
          : benchFirst
          ? ((p.close - benchFirst) / benchFirst) * 100
          : 0;
      byTs.set(p.ts, row);
    }
  }

  const rows = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);

  // Forward-fill: when a foreign-market ticker has no datum for a given
  // timestamp (e.g. KOSPI ticker on a US-only trading session), carry its
  // last known value forward so the tooltip and chart lines don't gap.
  const lastKnown = {};
  for (const t of tickers) lastKnown[t] = null;
  if (benchmark) lastKnown.__benchmark__ = null;
  for (const row of rows) {
    for (const key of Object.keys(lastKnown)) {
      if (row[key] == null && lastKnown[key] != null) {
        row[key] = lastKnown[key];
      }
      if (row[key] != null) lastKnown[key] = row[key];
    }
  }

  return rows;
}

function computePeriodReturns(tickers, history) {
  const out = {};
  for (const t of tickers) {
    const pts = history[t]?.points ?? [];
    if (pts.length < 2) {
      out[t] = null;
      continue;
    }
    const first = pts[0].close;
    const last = pts[pts.length - 1].close;
    out[t] = first ? ((last - first) / first) * 100 : null;
  }
  return out;
}

function EmptyState({ foreignOnly = false }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm italic text-slate-400">
      {foreignOnly
        ? "Foreign tickers can't be compared here — use Dashboard."
        : `Click up to ${MAX_COMPARE} tickers in the sidebar to compare them.`}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
      <span className="text-sm italic text-slate-400">
        Fetching history…
      </span>
    </div>
  );
}
