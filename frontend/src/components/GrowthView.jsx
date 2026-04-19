import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFundamentals } from "../hooks/useFundamentals";
import { TICKER_COLORS } from "../lib/colors";
import { InsightGrid } from "./InsightCard";

// Pick the smallest "nice" step (1-2-5 progression) where 2*step ≥ maxAbs,
// then return 5 symmetric ticks [-2s, -s, 0, s, 2s]. Guarantees round
// axis labels (e.g. -40/-20/0/+20/+40) regardless of the raw data max.
function niceSymmetricTicks(maxAbs) {
  if (maxAbs <= 0) return [-1, -0.5, 0, 0.5, 1];
  const niceMultipliers = [1, 2, 5];
  let step = 0;
  for (let pow = -3; pow <= 6; pow++) {
    const base = Math.pow(10, pow);
    for (const m of niceMultipliers) {
      const candidate = m * base;
      if (2 * candidate >= maxAbs) {
        step = candidate;
        break;
      }
    }
    if (step > 0) break;
  }
  if (step === 0) step = maxAbs;
  return [-2 * step, -step, 0, step, 2 * step];
}

// Map a classifyGrowth label → Tailwind text-color classes for the
// side-panel Growth Status table. Mirrors the "How to read" legend hues
// so panel and legend read as one visual system.
function statusColorClass(label) {
  switch (label) {
    case "Accelerating":
    case "Growing":
      return "text-emerald-600 dark:text-emerald-400";
    case "Flat":
      return "text-slate-500 dark:text-slate-400";
    case "Declining":
      return "text-amber-600 dark:text-amber-400";
    case "Shrinking":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-slate-400 dark:text-slate-500";
  }
}

// Rate comes in as a decimal from Yahoo (0.17 = 17%).
function classifyGrowth(rate) {
  if (rate == null) return { label: "—", color: "text-slate-400 bg-slate-50" };
  const pct = rate * 100;
  if (pct >= 20)
    return { label: "Accelerating", color: "text-emerald-700 bg-emerald-50" };
  if (pct >= 5)
    return { label: "Growing", color: "text-emerald-600 bg-emerald-50/60" };
  if (pct >= -5)
    return { label: "Flat", color: "text-slate-600 bg-slate-100" };
  if (pct >= -20)
    return { label: "Declining", color: "text-orange-700 bg-orange-50" };
  return { label: "Shrinking", color: "text-red-700 bg-red-50" };
}

function DivergingBarChart({ data, title, subtitle, emptyLabel }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm italic text-slate-400">
        {emptyLabel}
      </div>
    );
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)));
  // 5-tick "nice number" array — guarantees 0% is always a tick AND that
  // the outer ticks land on round values (e.g. ±40 instead of ±29). The
  // 1.3× multiplier gives the longest bar visible breathing room from the
  // axis edge so the percentage label can sit just outside the bar without
  // getting clipped against the plot boundary.
  const xTicks = niceSymmetricTicks(maxAbs * 1.3);
  // Domain = outermost tick so bars fit cleanly within the axis edges.
  const domain = xTicks[xTicks.length - 1];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
        {subtitle && (
          <span className="text-xs italic text-slate-400">· {subtitle}</span>
        )}
      </div>

      <div
        className="caret-transparent select-none outline-none"
        style={{ height: Math.max(200, data.length * 38 + 60) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 80, left: 140, bottom: 30 }}
          >
            <XAxis
              type="number"
              domain={[-domain, domain]}
              ticks={xTicks}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              stroke="#e2e8f0"
              tickFormatter={(v) =>
                v === 0 ? "0%" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`
              }
            />
            <YAxis
              type="category"
              dataKey="ticker"
              tick={{
                fill: "#334155",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "monospace",
              }}
              stroke="#e2e8f0"
              width={70}
            />
            <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1.5} />
            <Tooltip
              isAnimationActive={false}
              animationDuration={0}
              cursor={false}
              allowEscapeViewBox={{ x: false, y: false }}
              position={{ x: 0, y: 0 }}
              wrapperStyle={{ outline: "none" }}
              content={({ payload, coordinate, viewBox }) => {
                if (!payload || !payload.length || !coordinate || !viewBox)
                  return null;
                const p = payload[0].payload;
                const TW = 180;
                const GAP = 16;
                let left = coordinate.x - TW - GAP;
                if (left < viewBox.left + 4) left = coordinate.x + GAP;
                const top = Math.max(
                  viewBox.top + 4,
                  Math.min(
                    coordinate.y - 30,
                    viewBox.top + viewBox.height - 80
                  )
                );
                return (
                  <div
                    className="rounded-lg border px-3 py-2 shadow-[0_0_20px_rgba(124,58,237,0.25)] dark:border-violet-500 dark:bg-zinc-900/98"
                    style={{
                      position: "absolute",
                      left: `${left}px`,
                      top: `${top}px`,
                      background: "rgba(255, 255, 255, 0.98)",
                      borderColor: "#C4B5FD",
                      backdropFilter: "blur(8px)",
                      pointerEvents: "none",
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: p.color }}
                      />
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {p.ticker}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">{p.name}</div>
                    <div className="mt-1 flex justify-between gap-3 text-xs">
                      <span className="text-slate-500">YoY growth:</span>
                      <span
                        className={`font-mono font-semibold ${
                          p.value >= 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {p.value >= 0 ? "+" : ""}
                        {p.value.toFixed(2)}%
                      </span>
                    </div>
                    <div
                      className={`mt-1.5 rounded px-1.5 py-0.5 text-center text-[10px] font-medium ${p.classification.color}`}
                    >
                      {p.classification.label}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.value >= 0 ? d.color : "#ef4444"}
                  fillOpacity={d.value >= 0 ? 1 : 0.85}
                />
              ))}
              <LabelList
                dataKey="value"
                content={(props) => {
                  const { x, y, width, height, value } = props;
                  if (value == null) return null;
                  const isNegative = value < 0;
                  const pctText = `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
                  // Recharts' DivergingBarChart anchors `x` at the zero line
                  // (constant across bars) and gives a SIGNED `width` —
                  // positive for upward bars, NEGATIVE for downward bars. So
                  // the bar's far edge (where the % label belongs, OUTSIDE
                  // the fill) is always `x + width`, regardless of sign.
                  // Add an 8 px nudge in the bar's growth direction.
                  const xPos = isNegative ? x + width - 8 : x + width + 8;
                  return (
                    <text
                      x={xPos}
                      y={y + height / 2}
                      dominantBaseline="middle"
                      textAnchor={isNegative ? "end" : "start"}
                      fontSize={11}
                      fontWeight={600}
                      className="fill-slate-900 font-mono dark:fill-slate-100"
                    >
                      {pctText}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function GrowthView({ tickers }) {
  const { data: fundamentals, loading } = useFundamentals(tickers);

  const revData = useMemo(() => {
    return tickers
      .map((t, i) => {
        const rg = fundamentals[t]?.revenueGrowth;
        if (rg == null) return null;
        return {
          ticker: t,
          name: fundamentals[t]?.name || t,
          value: rg * 100,
          color: TICKER_COLORS[i % TICKER_COLORS.length],
          classification: classifyGrowth(rg),
        };
      })
      .filter((d) => d !== null)
      .sort((a, b) => b.value - a.value);
  }, [tickers, fundamentals]);

  const epsData = useMemo(() => {
    return tickers
      .map((t, i) => {
        const eg = fundamentals[t]?.earningsGrowth;
        if (eg == null) return null;
        return {
          ticker: t,
          name: fundamentals[t]?.name || t,
          value: eg * 100,
          color: TICKER_COLORS[i % TICKER_COLORS.length],
          classification: classifyGrowth(eg),
        };
      })
      .filter((d) => d !== null)
      .sort((a, b) => b.value - a.value);
  }, [tickers, fundamentals]);

  if (loading) {
    return (
      <div className="flex h-[420px] items-center justify-center">
        <span className="text-sm italic text-slate-400">
          Loading growth data…
        </span>
      </div>
    );
  }

  const missingRev = tickers.length - revData.length;
  const missingEps = tickers.length - epsData.length;

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      {/* LEFT: how-to-read legend (top) + stacked bar charts + missing-data notes */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-zinc-700/50 dark:bg-zinc-800/30">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            How to read
          </span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span>
              ≥+20%{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Accelerating
              </span>
            </span>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span>
              +5~+20%{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Growing
              </span>
            </span>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span>
              ±5%{" "}
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                Flat
              </span>
            </span>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span>
              −20~−5%{" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Declining
              </span>
            </span>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span>
              &lt;−20%{" "}
              <span className="font-semibold text-red-600 dark:text-red-400">
                Shrinking
              </span>
            </span>
          </span>
        </div>

        <DivergingBarChart
          data={revData}
          title="Revenue Growth (YoY)"
          subtitle="Latest quarter vs year-ago quarter"
          emptyLabel="No revenue growth data available"
        />
        <DivergingBarChart
          data={epsData}
          title="Earnings Growth (YoY)"
          subtitle="Latest quarter vs year-ago quarter"
          emptyLabel="No earnings growth data available"
        />

        {(missingRev > 0 || missingEps > 0) && (
          <div className="space-y-1 text-xs italic text-slate-400 dark:text-slate-500">
            {missingRev > 0 && (
              <p>{missingRev} ticker(s) missing revenue growth data</p>
            )}
            {missingEps > 0 && (
              <p>{missingEps} ticker(s) missing earnings growth data</p>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: Growth Status table (qualitative labels moved out of the
          chart to prevent edge clipping) + existing Fundamentals panel */}
      <div className="min-w-0 border-l border-slate-100 pl-4 dark:border-zinc-700/50">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Growth Status
        </p>
        <div className="mb-4 space-y-3 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 dark:border-zinc-700/50 dark:bg-zinc-800/50">
          <GrowthStatusList label="Revenue" rows={revData} />
          <GrowthStatusList label="Earnings" rows={epsData} />
        </div>

        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          💡 Fundamentals{" "}
          <span className="normal-case text-slate-400 dark:text-slate-500">
            (same across tabs)
          </span>
        </p>
        <InsightGrid
          tickers={tickers}
          fundamentals={fundamentals}
          tickerColors={TICKER_COLORS}
          layout="column"
        />
      </div>
    </div>
  );
}

function GrowthStatusList({ label, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <ul className="space-y-1">
        {rows.map((d) => (
          <li
            key={d.ticker}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs"
          >
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
              {d.ticker}
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {d.value >= 0 ? "+" : ""}
              {d.value.toFixed(1)}%
            </span>
            <span
              className={`text-[11px] font-medium ${statusColorClass(
                d.classification.label
              )}`}
            >
              {d.classification.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
