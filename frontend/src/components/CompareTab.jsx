import { useMemo, useState } from "react";
import { PERIODS } from "../hooks/useCompareData";
import { MAX_COMPARE, TICKER_COLORS } from "../lib/colors";
import ReturnView from "./ReturnView";
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
  const foreignOnly = usdTickers.length === 0 && tickers.length > 0;

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
          </>
        )}
      </div>

      {viewKey === "return" ? (
        <div className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
          <ReturnView
            tickers={usdTickers}
            foreignOnly={foreignOnly}
            periodKey={periodKey}
            customRange={customRange}
            viewMode={viewMode}
            benchmarkSymbol={selectedBenchmark?.symbol || null}
            customStartInput={customStartInput}
            customEndInput={customEndInput}
            compact={false}
          />
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

/* -------------------------- Header / chips / controls -------------------------- */

// (ChartView / CustomTooltip / EndpointDot / buildChartData /
// computePeriodReturns / Skeleton moved to ReturnView.jsx in the Phase 1
// refactor. Keep TickerChip + EmptyState here — they're still used by the
// CompareTab header + the Valuation / Growth / Risk empty-state branches.)

export function TickerChip({ ticker, color, onRemove, disabled = false }) {
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


function EmptyState({ foreignOnly = false }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm italic text-slate-400">
      {foreignOnly
        ? "Foreign tickers can't be compared here — use Dashboard."
        : `Click up to ${MAX_COMPARE} tickers in the sidebar to compare them.`}
    </div>
  );
}

