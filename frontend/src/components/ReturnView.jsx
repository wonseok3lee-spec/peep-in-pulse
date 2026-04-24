import { useMemo } from "react";
import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCompareData } from "../hooks/useCompareData";
import { MAX_COMPARE, TICKER_COLORS } from "../lib/colors";

/**
 * ReturnView — % return / price line chart + period recap legend.
 *
 * Self-contained: fetches its own compare data via useCompareData (mirrors
 * RiskView's self-sufficient pattern). The backend's _chart_cache absorbs
 * the duplicate fetch when this view and RiskView are active simultaneously.
 *
 * Props:
 *   tickers          USD-only ticker list that participates in the chart.
 *   foreignOnly      True when the parent's full list was non-empty but all
 *                    foreign; drives the empty-state copy.
 *   periodKey        "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "Max"
 *   customRange      { start, end } ISO or null. Overrides periodKey when set.
 *   viewMode         "pct" | "price" (default pct)
 *   benchmarkSymbol  "SPY" | "QQQ" | "DIA" | null
 *   customStartInput MM-DD-YYYY display text for the period-recap label
 *   customEndInput   MM-DD-YYYY display text for the period-recap label
 *   compact          When true, drop the 340px right column (period recap +
 *                    legend) and shrink the chart to 320px — used by the
 *                    Relations tab's 2x2 grid cells. Default false matches
 *                    the pre-refactor CompareTab layout pixel-for-pixel.
 */
export default function ReturnView({
  tickers,
  foreignOnly = false,
  periodKey,
  customRange = null,
  viewMode = "pct",
  benchmarkSymbol = null,
  customStartInput = "",
  customEndInput = "",
  compact = false,
}) {
  const isCustomActive = !!customRange;
  const { data: history, benchmark, loading, usingMock } = useCompareData(
    tickers,
    periodKey,
    customRange,
    benchmarkSymbol
  );

  const chartData = useMemo(
    () => buildChartData(tickers, history, viewMode, benchmark, periodKey),
    [tickers, history, viewMode, benchmark, periodKey]
  );
  const periodReturns = useMemo(
    () => computePeriodReturns(tickers, history, periodKey),
    [tickers, history, periodKey]
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
    for (const t of tickers) {
      const pts = history[t]?.points ?? [];
      out[t] = pts.length ? pts[pts.length - 1].close : null;
    }
    return out;
  }, [tickers, history]);

  const chartHeight = compact ? 320 : 440;
  const chartBox = (
    <div
      className="w-full caret-transparent outline-none"
      style={{ height: chartHeight }}
    >
      {tickers.length === 0 ? (
        <EmptyState foreignOnly={foreignOnly} />
      ) : loading ? (
        <Skeleton />
      ) : (
        <ChartView
          chartData={chartData}
          tickers={tickers}
          periodKey={periodKey}
          viewMode={viewMode}
          benchmark={benchmark}
          isCustomActive={isCustomActive}
        />
      )}
    </div>
  );

  const lastCloseHint = showLastCloseHint ? (
    <p className="mb-2 text-xs italic text-slate-400">
      Showing last trading session —{" "}
      {lastDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}
    </p>
  ) : null;

  const mockNote = usingMock ? (
    <p className="mt-3 text-xs italic text-slate-500">
      Using sample data — Yahoo Finance couldn&rsquo;t be reached.
    </p>
  ) : null;

  if (compact) {
    return (
      <>
        {lastCloseHint}
        {chartBox}
        {mockNote}
      </>
    );
  }

  return (
    <>
      {lastCloseHint}

      <div className="grid grid-cols-[1fr_340px] gap-4">
        {/* LEFT: chart only */}
        <div className="min-w-0">{chartBox}</div>

        {/* RIGHT: period recap + vertical legend + vs-benchmark (when active) */}
        <div className="min-w-0 border-l border-slate-100 pl-4 dark:border-zinc-700/50">
          {(() => {
            const validReturns = tickers
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
                      {best.pct > 0 ? "+" : ""}
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
                      {worst.pct > 0 ? "+" : ""}
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

          {tickers.length === 0 ? (
            <span className="text-xs italic text-slate-400">
              {foreignOnly
                ? "Foreign tickers can't be compared here — use Dashboard."
                : "No tickers selected."}
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
                  return tickers.map((t, i) => {
                    const color = TICKER_COLORS[i % TICKER_COLORS.length];
                    const pct = periodReturns[t];
                    const price = currentPrices[t];
                    const hasData = (history[t]?.points?.length ?? 0) > 1;
                    const delta =
                      pct != null && bReturn != null ? pct - bReturn : null;
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
                              : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
                          </span>
                        )}
                        {viewMode === "pct" && benchmark && delta != null && (
                          <span className="ml-auto flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500">
                              Δ {benchmark.symbol}
                            </span>
                            <span className={`font-semibold ${deltaColor}`}>
                              {delta > 0 ? "+" : ""}
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
                        {`${bReturn > 0 ? "+" : ""}${bReturn.toFixed(2)}%`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      {mockNote}
    </>
  );
}

/* ------------------------------ Chart ------------------------------ */

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
    const sign = v > 0 ? "+" : "";
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
    return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 120, bottom: 8, left: 0 }}
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
                // End-side labels render in the right-margin column via the
                // <Customized> layer below so multiple tickers at similar
                // y-values don't overlap. Start-side labels stay inline —
                // they're at the left edge with less collision risk.
                return (
                  <EndpointDot
                    key={`endpoint-${t}-${index}`}
                    cx={cx}
                    cy={cy}
                    color={color}
                    label={isStart ? formatEndpointLabel(value) : null}
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
        <Customized
          component={
            <EndpointLabelsLayer tickers={tickers} viewMode={viewMode} />
          }
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Customized layer: renders each ticker's end-value label in the reserved
// right-margin column, OUTSIDE the plot area. Two reasons:
//   1. Multiple tickers often end near the same y (e.g. +32% vs +25%) and
//      their inline labels collide; this layer does a global pass with
//      vertical collision resolution before rendering.
//   2. Labels in the margin give each line a quiet, reliable readout even
//      when the plot itself is visually busy.
// Recharts passes `formattedGraphicalItems` (one entry per <Line>, with
// computed screen-space `points`) and `offset` (plot rectangle) via the
// <Customized component={...}/> API. Tickers + viewMode come in through
// the element props we pass in ChartView.
function EndpointLabelsLayer(props) {
  const { formattedGraphicalItems, offset, tickers, viewMode } = props;
  if (!formattedGraphicalItems || !offset) return null;

  const formatLabel = (v) => {
    if (v == null || Number.isNaN(v)) return "";
    if (viewMode === "price") return `$${v.toFixed(2)}`;
    return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  };

  // Collect last-valid-point per ticker Line. Skip the dashed benchmark.
  const items = [];
  for (const gi of formattedGraphicalItems) {
    const dataKey = gi?.item?.props?.dataKey;
    if (!dataKey || dataKey === "__benchmark__") continue;
    if (tickers && !tickers.includes(dataKey)) continue;
    const stroke = gi?.item?.props?.stroke;
    const points = gi?.props?.points || [];
    let last = null;
    for (let i = points.length - 1; i >= 0; i--) {
      const v = points[i].value;
      if (v != null && !Number.isNaN(v)) {
        last = points[i];
        break;
      }
    }
    if (last == null) continue;
    items.push({ dataKey, color: stroke, y: last.y, value: last.value });
  }
  if (items.length === 0) return null;

  // Collision resolution: sort top→bottom, greedy-push any label that
  // sits within MIN_GAP of the previous one. If the bottom-most label
  // overflows the plot area after resolution, shift all up by the excess
  // (may reintroduce minor crowding at the top, acceptable for 4-5
  // tickers which is the typical max).
  items.sort((a, b) => a.y - b.y);
  const MIN_GAP = 14;
  for (let i = 1; i < items.length; i++) {
    if (items[i].y < items[i - 1].y + MIN_GAP) {
      items[i].y = items[i - 1].y + MIN_GAP;
    }
  }
  const plotBottom = offset.top + offset.height;
  const overflow = items[items.length - 1].y - plotBottom;
  if (overflow > 0) {
    for (const it of items) it.y -= overflow;
  }

  // Right YAxis width is declared as 56 on its <YAxis> element. Labels
  // render just past that, with +6px visual breathing room.
  const RIGHT_YAXIS_WIDTH = 56;
  const labelX = offset.left + offset.width + RIGHT_YAXIS_WIDTH + 6;

  return (
    <g pointerEvents="none">
      {items.map((it) => (
        <text
          key={it.dataKey}
          x={labelX}
          y={it.y + 4}
          textAnchor="start"
          fontSize={11}
          fontWeight={600}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill={it.color}
        >
          {formatLabel(it.value)}
        </text>
      ))}
    </g>
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
      : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

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

/* -------------------------- helpers -------------------------- */

function buildChartData(tickers, history, viewMode, benchmark, periodKey) {
  // 1D uses yesterday's close as the % baseline so the chart line reflects
  // the overnight gap (e.g., earnings-day line starts well above 0%). Other
  // periods keep the conventional first-bar-of-series baseline.
  const useYesterdayClose = periodKey === "1D";
  const firstCloses = {};
  for (const t of tickers) {
    const points = history[t]?.points ?? [];
    if (useYesterdayClose) {
      const pc = history[t]?.previousClose;
      firstCloses[t] = pc != null ? pc : (points.length ? points[0].close : null);
    } else {
      firstCloses[t] = points.length ? points[0].close : null;
    }
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
    const benchFirst =
      useYesterdayClose && benchmark.previousClose != null
        ? benchmark.previousClose
        : benchmark.points[0].close;
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

function computePeriodReturns(tickers, history, periodKey) {
  const out = {};
  for (const t of tickers) {
    const pts = history[t]?.points ?? [];
    if (pts.length < 2) {
      out[t] = null;
      continue;
    }
    // 1D measures from yesterday's close so the number matches the Sidebar
    // quote-board and includes any overnight earnings gap. Multi-day
    // periods keep the first-bar-in-series baseline — that's the
    // conventional "% return over this window" definition.
    let first;
    if (periodKey === "1D") {
      const pc = history[t]?.previousClose;
      if (pc != null) {
        first = pc;
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[compare] 1D previousClose missing for ${t}; falling back to first intraday bar`
        );
        first = pts[0].close;
      }
    } else {
      first = pts[0].close;
    }
    const last = pts[pts.length - 1].close;
    out[t] = first ? ((last - first) / first) * 100 : null;
  }
  return out;
}

/* ---------- local EmptyState / Skeleton (duplicated from CompareTab) ---------- */
// Intentional duplication: these are 16 LOC of presentational JSX with no
// logic. Keeping local copies avoids an import cycle between ReturnView
// and CompareTab. If we ever add a third call site, promote to a shared file.

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
