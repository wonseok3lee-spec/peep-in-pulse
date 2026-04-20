import { BoltIcon, Dot } from "./icons";
import { HoverTooltip } from "./HoverTooltip";
import { parseTag, timeAgo, isRecentSurprise } from "../lib/tags";

/**
 * "Top Signals" bar — the top-3 most important items rendered as horizontal
 * cards above the quadrant grid. Replaces the old pill-cloud which showed
 * all 15 items.
 *
 * Priority order: 🔴⚡ > 🔴 > 🟡⚡ > 🟡. Surprise gets a violet left border
 * so it reads at a glance even when combined with high/medium impact.
 */
function scoreItem(it) {
  const { isHigh, hasSurprise } = parseTag(it.tag);
  if (isHigh && hasSurprise) return 4;
  if (isHigh) return 3;
  if (hasSurprise) return 2;
  return 1;
}

export default function TagRow({ items }) {
  if (!items?.length) return null;

  const top3 = [...items]
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-3 gap-3">
      {top3.map((item, i) => (
        <SignalCard key={i} item={item} />
      ))}
    </div>
  );
}

function SignalCard({ item }) {
  const { isHigh, hasSurprise } = parseTag(item.tag);
  const showBolt = isRecentSurprise(item);

  // Left-border color: surprise wins over impact for the visual accent.
  let borderLeftColor;
  if (hasSurprise) borderLeftColor = "#7C3AED";
  else if (isHigh) borderLeftColor = "#EF4444";
  else borderLeftColor = "#F59E0B";

  // Dot still conveys impact level independently of border.
  const dotColor = isHigh ? "#EF4444" : "#F59E0B";

  const content = (
    <div className="flex items-center gap-2">
      {/* Fixed-width icon column — bolt sits just above dot so headlines align */}
      <div
        className="relative flex w-4 shrink-0 items-center"
        style={{ minHeight: "18px" }}
      >
        {dotColor ? (
          <>
            <Dot color={dotColor} size={8} />
            {showBolt && (
              <BoltIcon className="absolute -top-[2px] left-0 h-3.5 w-3.5 text-surprise" />
            )}
          </>
        ) : showBolt ? (
          <BoltIcon className="h-3.5 w-3.5 text-surprise" />
        ) : null}
      </div>
      <HoverTooltip
        content={item.summary || item.full_headline || item.headline}
        className="min-w-0 flex-1"
      >
        <span className="block truncate text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-100">
          {item.short_headline || item.headline}
        </span>
      </HoverTooltip>
      {item.published_time && (
        <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
          {timeAgo(item.published_time)}
        </span>
      )}
    </div>
  );

  return item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border-l-[3px] bg-white p-3 shadow-sm dark:bg-zinc-900 transition-shadow hover:shadow-md"
      style={{ borderLeftColor }}
    >
      {content}
    </a>
  ) : (
    <div
      className="rounded-lg border-l-[3px] bg-white p-3 shadow-sm dark:bg-zinc-900"
      style={{ borderLeftColor }}
    >
      {content}
    </div>
  );
}
