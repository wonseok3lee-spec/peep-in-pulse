import { useState } from "react";
import { MinusIcon } from "./icons";
import { usePrice } from "../hooks/usePrice";
import { useAHPrice } from "../hooks/useAHPrice";
import { useSparkline } from "../hooks/useSparkline";
import { SparklineWithTooltip } from "./Sparkline";
import { TICKER_COLORS, MAX_COMPARE } from "../lib/colors";
import { formatPrice, isSameEtDay } from "../lib/formatters";

function formatTicker(ticker) {
  const [symbol, suffix] = ticker.split(".");
  const displaySymbol = symbol.length > 6 ? symbol.slice(0, 6) : symbol;
  const exchangeBadge =
    suffix === "KS"
      ? "KOSPI"
      : suffix === "KQ"
      ? "KOSDAQ"
      : suffix === "T"
      ? "TSE"
      : suffix === "HK"
      ? "HKEX"
      : suffix === "L"
      ? "LSE"
      : suffix || null;
  return { displaySymbol, exchangeBadge };
}

const MAX_WATCHLIST = 6;

export default function Sidebar({
  watchlist,
  selected,
  compareSet,
  tickersData,
  activeTab,
  onTickerClick,
  onRemoveTicker,
  onReorder,
}) {
  const isCompareMode = activeTab === "compare";
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [sparkPeriod, setSparkPeriod] = useState("1D");

  return (
    <aside className="sticky top-[65px] flex h-[calc(100vh-65px)] w-[280px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-colors dark:border-zinc-700/50 dark:bg-[#0B0F14]">
      <div className="flex-1 space-y-4 p-4">
        {/* Persistent onboarding hint — always visible, points users at the
            top-bar search. Small glowing dot echoes the navbar logo so the
            affordance reads as "connected" to that search, not decorative. */}
        <div className="mb-3 flex items-center gap-2 px-1">
          <span
            aria-hidden="true"
            className="inline-block rounded-full"
            style={{
              width: "6px",
              height: "6px",
              background:
                "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)",
              boxShadow:
                "0 0 6px 1px rgba(139, 92, 246, 0.7), 0 0 12px 2px rgba(236, 72, 153, 0.4)",
              flexShrink: 0,
            }}
          />
          <p className="text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
            Type in the top bar to track
          </p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              My Watchlist
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={sparkPeriod}
                onChange={(e) => setSparkPeriod(e.target.value)}
                className="cursor-pointer rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <option value="1D">1D</option>
                <option value="5D">5D</option>
                <option value="1M">1M</option>
                <option value="6M">6M</option>
                <option value="1Y">1Y</option>
              </select>
              <span className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 dark:text-slate-500">
                {watchlist.length}/{MAX_WATCHLIST}
              </span>
            </div>
          </div>

          {watchlist.length === 0 ? (
            <p className="px-1 text-xs italic text-slate-400 dark:text-slate-500">
              Your watchlist is empty.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {watchlist.map((ticker, index) => {
                const compareIndex = compareSet.indexOf(ticker);
                const compareChecked = isCompareMode && compareIndex !== -1;
                return (
                  <SidebarRow
                    key={ticker}
                    index={index}
                    ticker={ticker}
                    sparkPeriod={sparkPeriod}
                    items={tickersData?.[ticker] ?? []}
                    selected={!isCompareMode && ticker === selected}
                    compareMode={isCompareMode}
                    compareChecked={compareChecked}
                    compareColor={
                      compareChecked
                        ? TICKER_COLORS[compareIndex % TICKER_COLORS.length]
                        : null
                    }
                    onSelect={() => onTickerClick(ticker)}
                    onRemove={() => onRemoveTicker(ticker)}
                    isDragOver={dragOverIndex === index}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", String(index))
                    }
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDragLeave={() => {
                      setDragOverIndex((cur) =>
                        cur === index ? null : cur
                      );
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = parseInt(
                        e.dataTransfer.getData("text/plain"),
                        10
                      );
                      setDragOverIndex(null);
                      if (!Number.isNaN(from) && from !== index) {
                        onReorder?.(from, index);
                      }
                    }}
                    onDragEnd={() => setDragOverIndex(null)}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 dark:border-zinc-700/50">
        <p className="text-[11px] italic text-slate-400 dark:text-slate-500">
          {isCompareMode
            ? compareSet.length >= MAX_COMPARE
              ? `Max ${MAX_COMPARE} tickers — remove one to add another`
              : "Click to toggle selection for chart"
            : "Click ticker to view details"}
        </p>
      </div>
    </aside>
  );
}

function SidebarRow({
  ticker,
  sparkPeriod,
  selected,
  compareChecked,
  onSelect,
  onRemove,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  const { price, changePct, currency, loading, error } = usePrice(ticker);
  const ah = useAHPrice(ticker);
  const { points: sparkPoints, timestamps: sparkTimestamps } = useSparkline(
    ticker,
    sparkPeriod
  );

  const priceOk = price != null && !error;

  // Same rule as TickerHeader: show during POST/PRE, and carry through
  // CLOSED while the bar is still from today in ET. Space is tight here,
  // so we render label + % only (no absolute price).
  const showAh =
    ah.supported &&
    ah.ahChangePct != null &&
    (ah.marketState === "POST" ||
      (ah.marketState === "CLOSED" && isSameEtDay(ah.ahTimestamp)));
  const showPre =
    ah.supported &&
    ah.preMarketChangePct != null &&
    (ah.marketState === "PRE" ||
      (ah.marketState === "CLOSED" && isSameEtDay(ah.preTimestamp)));
  let ahChip = null;
  if (showAh) {
    ahChip = { label: "AH", pct: ah.ahChangePct };
  } else if (showPre) {
    ahChip = { label: "Pre", pct: ah.preMarketChangePct };
  }
  const ahColor =
    ahChip == null
      ? ""
      : ahChip.pct >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-500 dark:text-red-400";

  // 1D reuses the dashboard card's day-over-day % (from usePrice) so both
  // surfaces always agree on the headline number. 5D+ derives the period
  // return from the sparkline's own points so the color / % match what's
  // drawn (5D = last week, 6M = 6 months, etc.).
  const periodReturn = (() => {
    if (sparkPeriod === "1D") return changePct;
    if (!sparkPoints || sparkPoints.length < 2) return null;
    const first = sparkPoints[0];
    const last = sparkPoints[sparkPoints.length - 1];
    if (first == null || last == null || first === 0) return null;
    return ((last - first) / first) * 100;
  })();
  const isPositive = periodReturn != null ? periodReturn >= 0 : true;
  const changeColor =
    periodReturn == null
      ? "text-slate-400 dark:text-slate-500"
      : periodReturn >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-500 dark:text-red-400";

  const [isDragging, setIsDragging] = useState(false);

  const highlight =
    selected || compareChecked
      ? "bg-indigo-50 dark:bg-indigo-950/30 border-l-4 border-l-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.25)] relative z-10"
      : "border-l-4 border-l-transparent hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

  return (
    <li>
      <div
        className={`group relative cursor-pointer select-none px-2 py-1 transition-colors ${highlight} ${
          isDragging ? "opacity-40" : ""
        }`}
        style={{ userSelect: "none" }}
        draggable={true}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onDragStart={(e) => {
          setIsDragging(true);
          onDragStart?.(e);
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          setIsDragging(false);
          onDrop?.(e);
        }}
        onDragEnd={(e) => {
          setIsDragging(false);
          onDragEnd?.(e);
        }}
      >
        {/* Insertion line shown above the row being dragged over */}
        {isDragOver && (
          <div className="absolute -top-[2px] left-0 right-0 z-20 h-[2px] rounded bg-indigo-500" />
        )}
        {/* Minus button — absolute top-left */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${ticker}`}
          className="absolute left-1 top-1 z-10 grid h-4 w-4 place-items-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white dark:border-slate-600 dark:bg-zinc-800 dark:text-slate-400 dark:hover:border-red-500 dark:hover:bg-red-500 dark:hover:text-white"
        >
          <MinusIcon className="h-3 w-3 stroke-[2.5]" />
        </button>

        <div className="flex items-stretch gap-2 pl-5">
          {/* LEFT: ticker + price + % — justify-between spreads across RIGHT col height */}
          <div className="flex w-[95px] shrink-0 flex-col justify-between py-0.5">
            {(() => {
              const { displaySymbol, exchangeBadge } = formatTicker(ticker);
              return (
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="font-mono text-[16px] font-bold leading-[1.1] text-slate-900 dark:text-slate-100">
                    {displaySymbol}
                  </span>
                  {exchangeBadge && (
                    <span className="rounded bg-slate-100 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-zinc-800 dark:text-slate-400">
                      {exchangeBadge}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className="font-mono text-[13px] font-semibold leading-[1.1] text-slate-800 dark:text-slate-100">
              {priceOk
                ? formatPrice(price, currency)
                : loading
                ? "…"
                : "--"}
            </div>
            <div
              className={`font-mono text-[14px] leading-[1.1] ${changeColor}`}
            >
              {periodReturn == null
                ? "—"
                : `${periodReturn >= 0 ? "+" : ""}${periodReturn.toFixed(2)}%`}
            </div>
            {ahChip && (
              <div
                className="font-mono text-[10px] leading-[1.1] text-slate-400 dark:text-zinc-500"
                title={`${ahChip.label === "AH" ? "After-hours" : "Pre-market"} change vs regular close`}
              >
                <span className="mr-0.5 rounded-sm bg-slate-100 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {ahChip.label}
                </span>
                <span className={ahColor}>
                  {ahChip.pct >= 0 ? "+" : ""}
                  {ahChip.pct.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {/* RIGHT: chart only — period is controlled by the sidebar header dropdown */}
          <div className="flex flex-1 items-center">
            <div className="w-full" style={{ height: 32 }}>
              <SparklineWithTooltip
                points={sparkPoints}
                timestamps={sparkTimestamps}
                period={sparkPeriod}
                positive={isPositive}
                currentPrice={price}
                height={32}
              />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
