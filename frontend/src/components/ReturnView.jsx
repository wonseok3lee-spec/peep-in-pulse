import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useYAxisScale,
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
  // the last-clicked button's value). The chart treats custom ranges as
  // always-daily — no intraday formatting. Tooltip semantics still
  // distinguish 1D vs 5D (intraday vs daily) — see CustomTooltip.
  const isIntraday =
    !isCustomActive && (periodKey === "1D" || periodKey === "5D");
  // For custom ranges, pick month/year formatting when the span is
  // wider than ~2 years; shorter custom ranges use month/day. Used by the
  // tooltip for date readability.
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

  // Period-aware X-axis tick formatter. The choice of granularity matches
  // what users expect to see at each zoom level — time-of-day is too noisy
  // for anything wider than 1D, full dates are wasted on multi-year charts.
  const formatX = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isCustomActive) {
      return useMonthYear
        ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
        : `${d.getMonth() + 1}/${d.getDate()}`;
    }
    switch (periodKey) {
      case "1D":
        return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      case "5D":
      case "1M":
        return `${d.getMonth() + 1}/${d.getDate()}`;
      case "6M":
      case "YTD":
      case "1Y":
        return d.toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        });
      case "5Y":
      case "Max":
        return String(d.getFullYear());
      default:
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }
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

  // For 5D, force one tick per trading day instead of letting Recharts pick
  // arbitrary 5-minute bars. Without this, evenly-spaced index ticks land
  // on whatever times happen to fall there (e.g. "12:30 PM, 02:30 PM,
  // 09:45 AM"), which is meaningless on a multi-day view. We collect the
  // first __xkey seen per (year, month, day) tuple — the dashed vertical
  // gridlines already mark day boundaries, so labeling those same
  // boundaries with M/D matches the visual semantic.
  let xTicks;
  if (periodKey === "5D" && !isCustomActive) {
    const seen = new Set();
    xTicks = [];
    for (const row of data) {
      if (!row.date) continue;
      const dayKey = `${row.date.getFullYear()}-${row.date.getMonth()}-${row.date.getDate()}`;
      if (!seen.has(dayKey)) {
        seen.add(dayKey);
        xTicks.push(row.__xkey);
      }
    }
  }

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

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 8, left: 0 }}
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
          ticks={xTicks}
        />
        {/* Right Y-axis renders no visible ticks or axis line: per-ticker
            endpoint labels (rendered by EndpointLabelsLayer below) carry
            the per-line value information. We keep the YAxis component
            so its scale is registered with the chart store and
            useYAxisScale("right") inside EndpointLabelsLayer resolves. */}
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={yDomain}
          tick={false}
          axisLine={false}
          width={0}
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
                // Dot-only at both ends. End labels render in the right-
                // margin column via EndpointLabelsLayer below. Start
                // labels are suppressed entirely: in pct mode every
                // ticker normalizes to 0% at period start, so N tickers
                // produced N stacked "0.00%" labels at the same point;
                // on 1D where start values differ, the line's starting y
                // already communicates that visually.
                return (
                  <EndpointDot
                    key={`endpoint-${t}-${index}`}
                    cx={cx}
                    cy={cy}
                    color={color}
                    label={null}
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
        {/* Per Recharts 3.x, custom layers are rendered directly as
            children — the deprecated <Customized> shim no longer forwards
            chart-context props to its component. EndpointLabelsLayer uses
            Recharts 3.x hooks (usePlotArea, useYAxisScale) internally. */}
        <EndpointLabelsLayer
          chartData={chartData}
          tickers={tickers}
          tickerColors={TICKER_COLORS}
          viewMode={viewMode}
          benchmark={benchmark}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Renders per-ticker value labels at each line's start (left edge) and
// end (right edge) terminus, sitting just outside the plot area so they
// read alongside the colored endpoint dots.
//
// Collision resolution: a global pass sorts labels by y-position and
// greedy-pushes any pair within 14 px vertically — prevents stacks when
// two tickers end at similar values.
//
// Start-side collapse: in pct mode, every ticker normalizes to 0 % at
// period start (1Y/5Y/YTD/etc), so N tickers would produce N stacked
// "0.00%" labels. When all first values agree within 0.1 %, we render a
// single neutral-colored shared label instead. For 1D (previousClose
// baseline, per-ticker different starts), per-ticker start labels render
// with the same collision logic as the end side.
//
// Recharts 3.x: this component renders directly as a child of <LineChart>;
// `usePlotArea()` + `useYAxisScale("right")` read from the chart store.
// The deprecated <Customized> shim no longer forwards chart context.
function EndpointLabelsLayer({
  chartData,
  tickers,
  tickerColors,
  viewMode,
  benchmark,
}) {
  const plot = usePlotArea();
  const yScale = useYAxisScale("right");
  if (!plot || !yScale) return null;

  const formatLabel = (v) => {
    if (v == null || Number.isNaN(v)) return "";
    if (viewMode === "price") return `$${v.toFixed(2)}`;
    return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  };

  // Collect first + last non-null values per ticker in a single pass.
  const raw = [];
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    let firstValue = null;
    let lastValue = null;
    for (let j = 0; j < chartData.length; j++) {
      const v = chartData[j][t];
      if (v != null && !Number.isNaN(v)) {
        firstValue = v;
        break;
      }
    }
    for (let j = chartData.length - 1; j >= 0; j--) {
      const v = chartData[j][t];
      if (v != null && !Number.isNaN(v)) {
        lastValue = v;
        break;
      }
    }
    if (firstValue == null || lastValue == null) continue;
    const firstY = yScale(firstValue);
    const lastY = yScale(lastValue);
    if (firstY == null || Number.isNaN(firstY)) continue;
    if (lastY == null || Number.isNaN(lastY)) continue;
    raw.push({
      dataKey: t,
      color: tickerColors[i % tickerColors.length],
      isBenchmark: false,
      firstValue,
      lastValue,
      firstY,
      lastY,
    });
  }

  // Add the benchmark series (SPY/QQQ/DIA dashed line) to the same item
  // list so its endpoint label participates in collision resolution and
  // shows alongside the ticker labels. Coloring is handled at render time
  // via a wrapping <g class="text-slate-400 dark:text-slate-300"> so the
  // benchmark label visually echoes the dashed grey line.
  if (benchmark && benchmark.points?.length > 0) {
    let firstValue = null;
    let lastValue = null;
    for (let j = 0; j < chartData.length; j++) {
      const v = chartData[j].__benchmark__;
      if (v != null && !Number.isNaN(v)) {
        firstValue = v;
        break;
      }
    }
    for (let j = chartData.length - 1; j >= 0; j--) {
      const v = chartData[j].__benchmark__;
      if (v != null && !Number.isNaN(v)) {
        lastValue = v;
        break;
      }
    }
    if (firstValue != null && lastValue != null) {
      const firstY = yScale(firstValue);
      const lastY = yScale(lastValue);
      if (
        firstY != null &&
        !Number.isNaN(firstY) &&
        lastY != null &&
        !Number.isNaN(lastY)
      ) {
        raw.push({
          dataKey: "__benchmark__",
          color: null, // null → render in slate-400/slate-300 grey
          isBenchmark: true,
          firstValue,
          lastValue,
          firstY,
          lastY,
        });
      }
    }
  }

  if (raw.length === 0) return null;

  const MIN_GAP = 14;
  const plotBottom = plot.y + plot.height;

  // Runs the greedy top→bottom push then clamps against the plot bottom.
  const resolveCollisions = (rows) => {
    rows.sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].y < rows[i - 1].y + MIN_GAP) {
        rows[i].y = rows[i - 1].y + MIN_GAP;
      }
    }
    const overflow = rows[rows.length - 1].y - plotBottom;
    if (overflow > 0) {
      for (const r of rows) r.y -= overflow;
    }
    return rows;
  };

  // === END labels (right edge) ===
  const endItems = resolveCollisions(
    raw.map((it) => ({
      dataKey: it.dataKey,
      color: it.color,
      isBenchmark: it.isBenchmark,
      value: it.lastValue,
      y: it.lastY,
    }))
  );
  // 12 px gap clears the endpoint dot's r=7 faint halo (gap of 6 left the
  // halo edge 1 px inside the label, reading as "on top of the dot").
  const endLabelX = plot.x + plot.width + 12;

  // === START labels (left edge) ===
  // If all first values are within 0.1 % of each other, collapse to one
  // shared neutral-colored label — avoids N identical "0.00%" labels
  // stacking in pct mode on multi-day periods (where every series,
  // benchmark included, normalizes to 0 % at period start).
  const firstValues = raw.map((it) => it.firstValue);
  const vmin = Math.min(...firstValues);
  const vmax = Math.max(...firstValues);
  const allStartsEqual = raw.length > 1 && vmax - vmin <= 0.1;

  let startItems;
  if (allStartsEqual) {
    startItems = [
      {
        dataKey: "__shared_start__",
        color: null, // null signals neutral text color
        isBenchmark: false,
        isShared: true,
        isBaseline: false,
        value: firstValues.reduce((s, v) => s + v, 0) / firstValues.length,
        y: raw.reduce((s, it) => s + it.firstY, 0) / raw.length,
      },
    ];
  } else {
    // Per-ticker start labels PLUS a synthetic baseline at y=yScale(0) in
    // pct mode. Without it, per-ticker label halos mask the left Y-axis
    // "0.0%" tick whenever a ticker starts near zero (e.g. 1D with a flat
    // ticker like TSLA at +0.85% sits within the halo's 1.5 px vertical
    // ring of y=0). The baseline label gives users an explicit grey
    // "0.00%" marker independent of which ticker values land where.
    // Skipped in price mode — "$0" isn't a meaningful baseline.
    const items = raw.map((it) => ({
      dataKey: it.dataKey,
      color: it.color,
      isBenchmark: it.isBenchmark,
      isShared: false,
      isBaseline: false,
      value: it.firstValue,
      y: it.firstY,
    }));
    if (viewMode === "pct") {
      items.push({
        dataKey: "__baseline__",
        color: null,
        isBenchmark: false,
        isShared: false,
        isBaseline: true,
        value: 0,
        y: yScale(0),
      });
    }
    startItems = resolveCollisions(items);
  }
  // Symmetric 12 px gap on the left — same reasoning as endLabelX.
  const startLabelX = plot.x - 12;

  const fontProps = {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  };

  // Halo: card-bg-colored 3 px stroke under each label so stacked labels
  // (after 14 px collision push) stay crisp against the chart gridlines.
  // 3 px is the minimal effective rim — bigger felt outlined-comic-book.
  // The right Y-axis is hidden (no tick text to mask), so we don't need
  // the wider halo previously used. Tailwind's stroke-white /
  // dark:stroke-zinc-900 resolve to the CompareTab card bg (#fff / #18181b).
  // `paintOrder` puts the stroke UNDER the fill so the colored text
  // isn't muddied.
  const haloProps = {
    className: "stroke-white dark:stroke-zinc-900",
    strokeWidth: 3,
    paintOrder: "stroke fill",
  };

  // Per-item color resolution. When `color` is set, fill inline with that
  // color (per-ticker case). Otherwise fill="currentColor" and a wrapping
  // <g> sets the inherited color via Tailwind text-* classes:
  //   - shared start (all-equal collapse) and baseline labels → slate-700
  //     (slightly darker grey, signals "this is the reference line");
  //   - benchmark line → slate-400 (matches its dashed stroke color).
  const groupClassFor = (it) => {
    if (it.isShared || it.isBaseline)
      return "text-slate-700 dark:text-zinc-300";
    if (it.isBenchmark) return "text-slate-400 dark:text-slate-300";
    return undefined;
  };

  return (
    <g pointerEvents="none">
      {/* End labels — per-ticker colored, benchmark in slate grey */}
      {endItems.map((it) => (
        <g key={`end-${it.dataKey}`} className={groupClassFor(it)}>
          <text
            x={endLabelX}
            y={it.y + 4}
            textAnchor="start"
            {...fontProps}
            {...haloProps}
            fill={it.color ?? "currentColor"}
          >
            {formatLabel(it.value)}
          </text>
        </g>
      ))}
      {/* Start labels — same color logic + collapse-to-shared when every
          series normalizes to 0 % at period start */}
      {startItems.map((it) => (
        <g key={`start-${it.dataKey}`} className={groupClassFor(it)}>
          <text
            x={startLabelX}
            y={it.y + 4}
            textAnchor="end"
            {...fontProps}
            {...haloProps}
            fill={it.color ?? "currentColor"}
          >
            {formatLabel(it.value)}
          </text>
        </g>
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
