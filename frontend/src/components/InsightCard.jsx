import { buildInsight, TONE_STYLES } from "../lib/insights";

/**
 * Shows a single ticker's combined-metric insight as a full-width card.
 * `compact` tightens padding + fonts for narrow column layouts.
 */
export function InsightCard({ ticker, color, insight, compact = false }) {
  if (!insight) return null;

  if (compact) {
    return (
      <div
        className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${TONE_STYLES[insight.tone]}`}
      >
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="font-mono text-[11px] font-bold">{ticker}</span>
        </div>
        <span className="flex-1 text-[10px] leading-snug">
          {insight.headline}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${TONE_STYLES[insight.tone]}`}
    >
      <div className="flex min-w-[90px] shrink-0 items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="font-mono text-sm font-bold">{ticker}</span>
      </div>
      <span className="flex-1 text-xs leading-snug">{insight.headline}</span>
    </div>
  );
}

/**
 * Grid of insight cards. `layout="column"` stacks vertically (tight, narrow);
 * default "grid" renders a 2-col responsive grid.
 */
export function InsightGrid({
  tickers,
  fundamentals,
  tickerColors,
  layout = "grid",
}) {
  const cards = tickers
    .map((t, i) => ({
      ticker: t,
      color: tickerColors[i % tickerColors.length],
      name: fundamentals[t]?.name || t,
      insight: buildInsight(fundamentals[t]),
    }))
    .filter((c) => c.insight !== null);

  if (cards.length === 0) return null;

  const isColumn = layout === "column";
  const containerClass = isColumn
    ? "flex flex-col gap-2"
    : "grid grid-cols-1 gap-2 md:grid-cols-2";

  return (
    <div className={containerClass}>
      {cards.map((c) => (
        <InsightCard
          key={c.ticker}
          ticker={c.ticker}
          color={c.color}
          insight={c.insight}
          compact={isColumn}
        />
      ))}
    </div>
  );
}
