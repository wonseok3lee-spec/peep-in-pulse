import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFundamentals } from "../hooks/useFundamentals";
import { TICKER_COLORS } from "../lib/colors";
import { InsightGrid } from "./InsightCard";

export default function ValuationView({ tickers }) {
  const { data, loading } = useFundamentals(tickers);

  if (loading) {
    return (
      <div className="flex h-[380px] items-center justify-center">
        <span className="text-sm italic text-slate-400">
          Loading fundamentals…
        </span>
      </div>
    );
  }

  // Build P/E chart data; skip missing or negative P/E (meaningless or unprofitable).
  const peData = tickers
    .map((t, i) => ({
      ticker: t,
      name: data[t]?.name || t,
      pe: data[t]?.trailingPE,
      forwardPE: data[t]?.forwardPE,
      color: TICKER_COLORS[i % TICKER_COLORS.length],
    }))
    .filter((d) => d.pe != null && d.pe > 0)
    .sort((a, b) => a.pe - b.pe);

  const avgPE =
    peData.length > 0
      ? peData.reduce((sum, d) => sum + d.pe, 0) / peData.length
      : 0;

  const interpret = (pe) => {
    if (pe < avgPE * 0.85)
      return { label: "Cheap", color: "text-emerald-600 bg-emerald-50" };
    if (pe > avgPE * 1.15)
      return { label: "Premium", color: "text-red-600 bg-red-50" };
    return { label: "Fair", color: "text-slate-600 bg-slate-100" };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-zinc-700/50 dark:bg-zinc-800/30">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          How to read
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span>
            &lt; 85% of group avg{" "}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              Cheap
            </span>
          </span>
          <span className="text-slate-300 dark:text-zinc-600">·</span>
          <span>
            85–115% of group avg{" "}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Fair
            </span>
          </span>
          <span className="text-slate-300 dark:text-zinc-600">·</span>
          <span>
            &gt; 115% of group avg{" "}
            <span className="font-semibold text-red-600 dark:text-red-400">
              Premium
            </span>
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-4">
        {/* LEFT: P/E chart + missing-data note */}
        <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            P/E Ratio (trailing)
          </h3>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            · Group avg:{" "}
            <span className="font-semibold">{avgPE.toFixed(1)}</span> · Lower
            = cheaper
          </span>
        </div>

        <div
          className="caret-transparent select-none outline-none"
          style={{ height: Math.max(200, peData.length * 48) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={peData}
              layout="vertical"
              margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
            >
              <XAxis
                type="number"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                stroke="#e2e8f0"
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
                      className="rounded-lg border px-3 py-2 shadow-[0_0_20px_rgba(124,58,237,0.2)] dark:border-violet-500 dark:bg-zinc-900/98"
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
                      <div className="mb-1 text-xs font-semibold text-slate-700">
                        {p.ticker}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {p.name}
                      </div>
                      <div className="mt-1.5 flex justify-between gap-3 text-xs">
                        <span className="text-slate-500">Trailing P/E:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {p.pe?.toFixed(2)}
                        </span>
                      </div>
                      {p.forwardPE != null && (
                        <div className="flex justify-between gap-3 text-xs">
                          <span className="text-slate-500">Forward P/E:</span>
                          <span className="font-mono text-slate-800">
                            {p.forwardPE?.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="pe" radius={[0, 4, 4, 0]}>
                {peData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
                <LabelList
                  dataKey="pe"
                  content={(props) => {
                    const { x, y, width, height, value, index } = props;
                    if (value == null || index == null) return null;
                    const entry = peData[index];
                    if (!entry) return null;
                    const label = interpret(entry.pe).label;
                    const labelClass =
                      label === "Cheap"
                        ? "fill-emerald-600 dark:fill-emerald-400"
                        : label === "Premium"
                        ? "fill-red-600 dark:fill-red-400"
                        : "fill-slate-500 dark:fill-slate-400";
                    // Width-aware placement: classification label sits just
                    // past the rendered numeric value, not at a fixed offset.
                    const valueText = value.toFixed(1);
                    const valueWidth = valueText.length * 6.8;
                    const labelGap = 8;
                    const numericX = x + width + 8;
                    const classX = numericX + valueWidth + labelGap;
                    return (
                      <g>
                        <text
                          x={numericX}
                          y={y + height / 2}
                          dominantBaseline="middle"
                          fontSize={12}
                          fontWeight={600}
                          className="fill-slate-900 font-mono dark:fill-slate-100"
                        >
                          {valueText}
                        </text>
                        <text
                          x={classX}
                          y={y + height / 2}
                          dominantBaseline="middle"
                          fontSize={11}
                          fontWeight={500}
                          className={labelClass}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {peData.length < tickers.length && (
          <p className="mt-3 text-xs italic text-slate-400">
            {tickers.length - peData.length} ticker(s) have no P/E data
            (negative earnings or not reported)
          </p>
        )}
        </div>

        {/* RIGHT: Combined Signals column */}
        <div className="min-w-0 border-l border-slate-100 pl-4 dark:border-zinc-700/50">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            💡 Fundamentals{" "}
            <span className="normal-case text-slate-400 dark:text-slate-500">
              (same across tabs)
            </span>
          </p>
          <InsightGrid
            tickers={tickers}
            fundamentals={data}
            tickerColors={TICKER_COLORS}
            layout="column"
          />
        </div>
      </div>
    </div>
  );
}
