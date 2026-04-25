import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useCompareData } from "../hooks/useCompareData";
import { useFundamentals } from "../hooks/useFundamentals";
import { usePrices } from "../hooks/usePrices";
import { TICKER_COLORS } from "../lib/colors";
import { InsightGrid } from "./InsightCard";

// Pick the smallest "nice" step (1-2-5 progression) where 2*step ≥ maxAbs,
// then return 5 symmetric ticks [-2s, -s, 0, s, 2s]. Guarantees round
// axis labels regardless of the raw data max.
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

function formatReturn(v) {
  const absV = Math.abs(v);
  if (absV >= 1_000_000)
    return `${v >= 0 ? "+" : ""}${(v / 1_000_000).toFixed(1)}M%`;
  if (absV >= 10_000)
    return `${v >= 0 ? "+" : ""}${(v / 1_000).toFixed(0)}k%`;
  if (absV >= 1_000)
    return `${v >= 0 ? "+" : ""}${(v / 1_000).toFixed(1)}k%`;
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function classifyPoint(beta, ret) {
  const highBeta = beta >= 1.0;
  const positiveReturn = ret >= 0;

  if (!highBeta && positiveReturn) {
    return {
      label: "Sweet spot",
      color: "text-emerald-700 bg-emerald-50",
      description: "Low risk, positive return — ideal",
    };
  }
  if (highBeta && positiveReturn) {
    return {
      label: "High risk, high reward",
      color: "text-violet-700 bg-violet-50",
      description: "Volatile but profitable",
    };
  }
  if (!highBeta && !positiveReturn) {
    return {
      label: "Safe loss",
      color: "text-slate-700 bg-slate-100",
      description: "Stable but losing",
    };
  }
  return {
    label: "High risk, low reward",
    color: "text-red-700 bg-red-50",
    description: "Volatile AND losing — avoid",
  };
}

export function RiskView({ tickers, periodKey, compact = false }) {
  const { data: fundamentals, loading: fLoading } = useFundamentals(tickers);
  const { data: history, loading: hLoading } = useCompareData(
    tickers,
    periodKey
  );
  // Shares usePrice's module registry; for 1D we prefer usePrice.changePct
  // (prev close → current) over useCompareData's intraday-only series so the
  // scatter agrees with Sidebar + Dashboard on gap-up/down days.
  const priceByTicker = usePrices(tickers);

  const loading = fLoading || hLoading;

  const points = useMemo(() => {
    return tickers
      .map((t, i) => {
        const beta = fundamentals[t]?.beta;
        const hist = history[t]?.points ?? [];
        if (beta == null || hist.length < 2) return null;

        const firstClose = hist[0].close;
        const lastClose = hist[hist.length - 1].close;
        const intradayReturn = ((lastClose - firstClose) / firstClose) * 100;

        // 1D unifies with Sidebar/Dashboard via usePrice.changePct so a gap
        // open (prev close → today's open) is included in the headline %.
        // Any other period: keep first/last close math — daily+ bars already
        // capture the prev-close reference, so no gap problem to fix.
        let periodReturn;
        if (periodKey === "1D") {
          const cp = priceByTicker[t]?.changePct;
          periodReturn = cp == null ? intradayReturn : cp;
        } else {
          periodReturn = intradayReturn;
        }

        return {
          ticker: t,
          name: fundamentals[t]?.name || t,
          beta,
          periodReturn,
          color: TICKER_COLORS[i % TICKER_COLORS.length],
          classification: classifyPoint(beta, periodReturn),
        };
      })
      .filter((p) => p !== null);
  }, [tickers, fundamentals, history, periodKey, priceByTicker]);

  if (loading) {
    return (
      <div
        className={`flex ${
          compact ? "h-[340px]" : "h-[420px]"
        } items-center justify-center`}
      >
        <span className="text-sm italic text-slate-400">
          Loading risk data…
        </span>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div
        className={`flex ${
          compact ? "h-[340px]" : "h-[420px]"
        } items-center justify-center`}
      >
        <span className="text-sm italic text-slate-400">
          No risk data available for selected tickers
        </span>
      </div>
    );
  }

  // Axis domains with padding
  const betas = points.map((p) => p.beta);
  const returns = points.map((p) => p.periodReturn);
  const betaMin = Math.min(0, Math.min(...betas) - 0.2);
  const betaMax = Math.max(2, Math.max(...betas) + 0.2);
  const returnExtreme = Math.max(
    Math.abs(Math.min(...returns)),
    Math.abs(Math.max(...returns))
  );
  // Cap axis at ±500% so a single outlier (e.g. MSFT on Max period) doesn't
  // squash every other point near zero. Off-scale points get pinned to the
  // edge visually and flagged below the chart.
  const RETURN_CAP = 500;
  const returnDomain = Math.min(
    RETURN_CAP,
    Math.max(5, returnExtreme * 1.2)
  );
  const clampedPoints = points.filter(
    (p) => Math.abs(p.periodReturn) > RETURN_CAP
  );
  const plotPoints = points.map((p) => ({
    ...p,
    plotReturn:
      p.periodReturn > RETURN_CAP
        ? RETURN_CAP
        : p.periodReturn < -RETURN_CAP
        ? -RETURN_CAP
        : p.periodReturn,
  }));

  // "Nice number" 5-tick array based on the actual clamped extreme (not
  // the inflated 1.2× domain). Gives round labels (±250/±500) instead of
  // odd ones derived from returnExtreme.
  const effectiveMax = Math.min(returnExtreme, RETURN_CAP);
  const yTicks = niceSymmetricTicks(effectiveMax);
  // Use the outermost tick as the actual plot domain so axis labels
  // reach the chart edges. `returnDomain` stays for the clamping logic.
  const plotDomain = yTicks[yTicks.length - 1];

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-zinc-700/50 dark:bg-zinc-800/30">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            How to read
          </span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-emerald-200 dark:bg-emerald-900/50" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                Sweet spot
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                low risk, positive return
              </span>
            </span>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-violet-200 dark:bg-violet-900/50" />
              <span className="font-semibold text-violet-700 dark:text-violet-400">
                High risk, high reward
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                volatile, profitable
              </span>
            </span>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-slate-200 dark:bg-zinc-700" />
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Safe loss
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                stable but losing
              </span>
            </span>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-red-200 dark:bg-red-900/50" />
              <span className="font-semibold text-red-700 dark:text-red-400">
                High risk, low reward
              </span>
              <span className="text-slate-500 dark:text-slate-400">avoid</span>
            </span>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Risk vs Return ({periodKey})
        </h3>
        <span className="text-xs italic text-slate-400">
          · X: Beta (vol vs market) · Y: period % return
        </span>
      </div>

      {/* Compact mode (Relations 2x2 grid cell) drops both side columns
          (β·Return list + Fundamentals) and shrinks the scatter — keeps
          the cell within a 2x2 grid budget while preserving the 4-quadrant
          context that makes the view readable. */}
      <div className={compact ? "" : "grid grid-cols-[1fr_170px_320px] gap-4"}>
        <div
          className="min-w-0 caret-transparent outline-none"
          style={{ height: compact ? 340 : 460 }}
        >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 15, bottom: 40, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />

            {/* 4 quadrant tints */}
            <ReferenceArea
              x1={betaMin}
              x2={1}
              y1={0}
              y2={plotDomain}
              fill="#10b981"
              fillOpacity={0.1}
              strokeOpacity={0}
            />
            <ReferenceArea
              x1={1}
              x2={betaMax}
              y1={0}
              y2={plotDomain}
              fill="#8b5cf6"
              fillOpacity={0.1}
              strokeOpacity={0}
            />
            <ReferenceArea
              x1={betaMin}
              x2={1}
              y1={-plotDomain}
              y2={0}
              fill="#475569"
              fillOpacity={0.14}
              strokeOpacity={0}
            />
            <ReferenceArea
              x1={1}
              x2={betaMax}
              y1={-plotDomain}
              y2={0}
              fill="#ef4444"
              fillOpacity={0.1}
              strokeOpacity={0}
            />

            <ReferenceLine
              x={1}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{
                value: "β = 1 (market)",
                position: "top",
                fill: "#94a3b8",
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={0}
              stroke="#475569"
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />

            <XAxis
              type="number"
              dataKey="beta"
              name="Beta"
              domain={[betaMin, betaMax]}
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="#e2e8f0"
              label={{
                value: "Beta (volatility vs S&P 500)",
                position: "insideBottom",
                offset: -25,
                fill: "#64748b",
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="plotReturn"
              name="Return"
              domain={[-plotDomain, plotDomain]}
              ticks={yTicks}
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="#e2e8f0"
              tickFormatter={(v) => (v === 0 ? "0%" : formatReturn(v))}
              label={{
                value: "Period return",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 11,
              }}
            />
            <ZAxis range={[200, 200]} />

            <Tooltip
              isAnimationActive={false}
              animationDuration={0}
              cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3", strokeWidth: 1 }}
              wrapperStyle={{ outline: "none" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div
                    className="rounded-lg border px-3 py-2 shadow-[0_0_20px_rgba(124,58,237,0.25)] dark:border-violet-500 dark:bg-zinc-900/98"
                    style={{
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
                    <div className="mb-1.5 text-[11px] text-slate-500">
                      {p.name}
                    </div>
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-500">Beta:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {p.beta.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-500">Return:</span>
                      <span
                        className={`font-mono font-semibold ${
                          p.periodReturn >= 0
                            ? "text-emerald-600"
                            : "text-red-500"
                        }`}
                      >
                        {formatReturn(p.periodReturn)}
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

            <Scatter data={plotPoints}>
              {plotPoints.map((p, i) => (
                <Cell key={i} fill={p.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        </div>

        {/* MIDDLE: β · Return reference list — hidden in compact mode */}
        {!compact && (
          <div className="min-w-0 border-l border-slate-100 pl-3 dark:border-zinc-700/50">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              β · Return
            </p>
            <div className="flex flex-col gap-1.5">
              {points.map((p) => (
                <div
                  key={p.ticker}
                  className="flex items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 dark:border-zinc-700/50 dark:bg-zinc-800/50"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                    {p.ticker}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400">
                      β{p.beta.toFixed(2)}
                    </span>
                    <span
                      className={
                        p.periodReturn >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-500 dark:text-red-400"
                      }
                    >
                      {formatReturn(p.periodReturn)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RIGHT: Combined Signals column — hidden in compact mode */}
        {!compact && (
          <div className="min-w-0 border-l border-slate-100 pl-4 dark:border-zinc-700/50">
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
        )}
      </div>

      {clampedPoints.length > 0 && (
        <p className="text-xs italic text-slate-400">
          {clampedPoints.map((p) => p.ticker).join(", ")} pinned at axis
          limit (actual return off-scale)
        </p>
      )}

      {/* Quadrant legend */}
      {points.length < tickers.length && (
        <p className="text-xs italic text-slate-400">
          {tickers.length - points.length} ticker(s) excluded (no beta available)
        </p>
      )}

    </div>
  );
}
