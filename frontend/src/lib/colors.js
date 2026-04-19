/**
 * Compare-chart ticker palette. Assigned in insertion order: the first ticker
 * added to the compare list gets indigo, the second red, etc.
 * Shared between CompareTab and Sidebar so the sidebar dot color matches
 * the chart line color.
 */
export const TICKER_COLORS = [
  "#6366F1", // indigo
  "#EF4444", // red
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#8B5CF6", // violet
  "#F97316", // orange
  "#14B8A6", // teal
  "#A855F7", // purple
];

export const MAX_COMPARE = 10;
