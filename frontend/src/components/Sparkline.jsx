import { useState } from "react";
import { isSameEtDay } from "../lib/formatters";

export function SparklineWithTooltip({
  points,
  positive,
  currentPrice,
  height = 48,
  timestamps = [],
  period = "1D",
  // Extended-hours overlay. Callers pass these straight from useAHPrice;
  // the sparkline self-gates on period === "1D" + presence + same-ET-day,
  // so missing/stale/foreign-ticker data naturally renders nothing extra.
  // Pre-market mirrors after-hours: dashed line + dot on the opposite edge.
  ahPrice = null,
  ahTimestamp = null,
  ahChangePct = null,
  preMarketPrice = null,
  preMarketChangePct = null,
  preTimestamp = null,
  marketState = null,
}) {
  const [hover, setHover] = useState(null);
  if (!points || points.length < 2) return null;

  const formatTooltipLabel = (idx) => {
    const priceStr = `$${points[idx]?.toFixed(2)}`;
    const ts = timestamps[idx];
    if (!ts) return priceStr;
    const d = new Date(ts * 1000);
    if (period === "1D") {
      const today = new Date();
      const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
      const time = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      if (sameDay) return `${priceStr}  ${time}`;
      const date = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      return `${priceStr}  ${date} ${time}`;
    }
    const date = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${priceStr}  ${date}`;
  };

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 100;
  const H = height;

  // Extended-hours layout: reserve the left 15% for pre-market when
  // showPre and/or the right 15% for after-hours when showAh. The RTH
  // line maps [0, N-1] → [RTH_START_X, RTH_END_X]. With neither gate
  // active, start/end collapse to 0/W and every coordinate below matches
  // the original full-width behavior exactly.
  // Gate logic mirrors Sidebar.jsx's AH-chip gates so the sparkline and the
  // chip never disagree: PRE renders only during the PRE window (or CLOSED
  // if the bar is still today in ET), AH renders only during POST (same
  // carry-through for CLOSED). Without this alignment the sparkline would
  // keep PRE visible all day once pre-market printed.
  const showAh =
    period === "1D" &&
    ahPrice != null &&
    ahTimestamp != null &&
    (marketState === "POST" ||
      (marketState === "CLOSED" && isSameEtDay(ahTimestamp)));
  const showPre =
    period === "1D" &&
    preMarketPrice != null &&
    preTimestamp != null &&
    (marketState === "PRE" ||
      (marketState === "CLOSED" && isSameEtDay(preTimestamp)));
  const RTH_START_X = showPre ? 15 : 0;
  const RTH_END_X = showAh ? 85 : W;
  const AH_X = 92;
  const PRE_X = 8;

  const toX = (i) =>
    RTH_START_X + (i / (points.length - 1)) * (RTH_END_X - RTH_START_X);
  const toY = (v) => H - ((v - min) / range) * (H - 6) - 3;

  // AH / PRE dot Y uses the same price scale as the RTH line. Clamp into
  // [3, H-3] so the 5px dot stays fully inside the container even when the
  // extended-hours price blew past the RTH range (earnings gaps).
  const ahDotY = showAh
    ? Math.max(3, Math.min(H - 3, toY(ahPrice)))
    : null;
  const ahIsDown = ahChangePct != null && ahChangePct < 0;
  const ahDotColor = ahIsDown ? "#EF4444" : "#16A34A";
  const ahDotGlow = ahIsDown
    ? "rgba(239, 68, 68, 0.7)"
    : "rgba(22, 163, 74, 0.7)";

  const preDotY = showPre
    ? Math.max(3, Math.min(H - 3, toY(preMarketPrice)))
    : null;
  const preIsDown = preMarketChangePct != null && preMarketChangePct < 0;
  const preDotColor = preIsDown ? "#EF4444" : "#16A34A";
  const preDotGlow = preIsDown
    ? "rgba(239, 68, 68, 0.7)"
    : "rgba(22, 163, 74, 0.7)";

  const coords = points.map((p, i) => `${toX(i)},${toY(p)}`);
  const color = positive ? "#16A34A" : "#EF4444";

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const xPctFull = (xPx / rect.width) * 100;
    // Clamp hover to the RTH zone so the cursor line never strays into
    // either extended-hours zone implying data that isn't there.
    const xInRth = Math.max(RTH_START_X, Math.min(xPctFull, RTH_END_X));
    const rthSpan = RTH_END_X - RTH_START_X;
    const idx = Math.round(((xInRth - RTH_START_X) / rthSpan) * (points.length - 1));
    const clamped = Math.max(0, Math.min(points.length - 1, idx));
    setHover({ idx: clamped, price: points[clamped], x: xInRth });
  };

  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${height}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <path
          d={`M ${coords.join(" L ")}`}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hover && (
          <line
            x1={hover.x}
            y1={0}
            x2={hover.x}
            y2={H}
            stroke="#94a3b8"
            strokeWidth="0.5"
            strokeDasharray="2,2"
          />
        )}
        {/* Dashed market-open marker. Mirrors the close marker below but on
            the left edge — the PRE dot sits clearly to its left. */}
        {showPre && (
          <line
            className="stroke-slate-300 dark:stroke-zinc-600"
            x1={RTH_START_X}
            y1={0}
            x2={RTH_START_X}
            y2={H}
            strokeWidth="0.5"
            strokeDasharray="2,2"
            strokeOpacity={0.4}
          />
        )}
        {/* Dashed market-close marker. Drawn at RTH_END_X so the AH dot
            sits clearly to its right. Tailwind stroke classes apply to SVG
            via CSS so dark mode picks up zinc-600 automatically. */}
        {showAh && (
          <line
            className="stroke-slate-300 dark:stroke-zinc-600"
            x1={RTH_END_X}
            y1={0}
            x2={RTH_END_X}
            y2={H}
            strokeWidth="0.5"
            strokeDasharray="2,2"
            strokeOpacity={0.4}
          />
        )}
      </svg>
      {/* Purple endpoint dots. Rendered as HTML divs so they stay circular
          regardless of the SVG's preserveAspectRatio="none" horizontal
          stretching. Positioned at left/right edges with translateY(-50%)
          so the 6px dots sit fully inside the container bounds (toY clamps
          to [3, H-3] so the vertical extent never overflows either). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          width: "6px",
          height: "6px",
          top: `${toY(points[0])}px`,
          background: "#7C3AED",
          filter: "drop-shadow(0 0 4px rgba(124, 58, 237, 0.7))",
          ...(showPre
            ? { left: `${RTH_START_X}%`, transform: "translate(-50%, -50%)" }
            : { left: 0, transform: "translateY(-50%)" }),
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          width: "6px",
          height: "6px",
          top: `${toY(points[points.length - 1])}px`,
          background: "#7C3AED",
          filter: "drop-shadow(0 0 4px rgba(124, 58, 237, 0.7))",
          ...(showAh
            ? { left: `${RTH_END_X}%`, transform: "translate(-50%, -50%)" }
            : { right: 0, transform: "translateY(-50%)" }),
        }}
      />
      {/* PRE indicator dot — mirror of the AH dot on the left edge. Same
          sizing + green/red direction coding + native title tooltip. */}
      {showPre && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            width: "5px",
            height: "5px",
            left: `${PRE_X}%`,
            top: `${preDotY}px`,
            transform: "translate(-50%, -50%)",
            background: preDotColor,
            filter: `drop-shadow(0 0 4px ${preDotGlow})`,
          }}
          title={
            preMarketChangePct != null
              ? `Pre-market ${preMarketChangePct >= 0 ? "+" : ""}${preMarketChangePct.toFixed(2)}%`
              : "Pre-market"
          }
        />
      )}
      {/* AH indicator dot — green/red glow by ahChangePct direction, a hair
          smaller (5px vs 6px) than the purple RTH endpoints so it reads as
          a different zone. Title attribute gives a native hover tooltip
          without adding hover state. */}
      {showAh && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            width: "5px",
            height: "5px",
            left: `${AH_X}%`,
            top: `${ahDotY}px`,
            transform: "translate(-50%, -50%)",
            background: ahDotColor,
            filter: `drop-shadow(0 0 4px ${ahDotGlow})`,
          }}
          title={
            ahChangePct != null
              ? `After-hours ${ahChangePct >= 0 ? "+" : ""}${ahChangePct.toFixed(2)}%`
              : "After-hours"
          }
        />
      )}
      {/* Hover price tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md border border-violet-300 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-700 shadow-[0_0_10px_rgba(124,58,237,0.3)] dark:border-violet-500 dark:bg-zinc-900 dark:text-slate-200"
          style={{
            left: `${hover.x}%`,
            // Always render left of cursor for consistent direction.
            transform: "translateX(-100%) translateX(-8px)",
          }}
        >
          {formatTooltipLabel(hover.idx)}
        </div>
      )}
    </div>
  );
}
