/**
 * Adapt the backend's combined-emoji `tag` string into separate flags.
 * Backend emits one of "🔴⚡" | "🔴" | "🟡⚡" | "🟡".
 */
export function parseTag(tag = "") {
  return {
    isHigh: tag.includes("🔴"),
    isMedium: tag.includes("🟡"),
    hasSurprise: tag.includes("⚡"),
  };
}

// Bolt icon is gated to fresh news only — the underlying surprise flag can
// still linger on older stories (used for sort priority etc.), but the
// ⚡ visual would be misleading once the news is no longer "breaking".
const SURPRISE_MAX_AGE_MS = 10 * 60 * 60 * 1000;

/**
 * Render-time gate: true iff the item is tagged as a surprise AND was
 * published within the last 10 hours. Missing or invalid `published_time`
 * → false (no ⚡).
 */
export function isRecentSurprise(item, now = Date.now()) {
  if (!item) return false;
  const { hasSurprise } = parseTag(item.tag);
  if (!hasSurprise) return false;
  if (!item.published_time) return false;
  const t = new Date(item.published_time).getTime();
  if (Number.isNaN(t)) return false;
  const age = now - t;
  return age >= 0 && age <= SURPRISE_MAX_AGE_MS;
}

export const QUADRANT_KEYS = ["internal", "external"];

export function groupByQuadrant(items) {
  const out = { internal: [], external: [] };
  for (const it of items ?? []) {
    const k = ["internal", "external"].includes(it.quadrant)
      ? it.quadrant
      : "external";
    out[k].push(it);
  }
  return out;
}

/** "5m ago" / "3h ago" / "Apr 17" (for news older than a day). */
export function timeAgo(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;

  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "XX min ago" — counts up as wall-clock advances. */
export function formatRelative(iso, now = Date.now()) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}
