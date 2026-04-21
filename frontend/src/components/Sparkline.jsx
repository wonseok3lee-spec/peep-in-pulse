import { useState } from "react";

export function SparklineWithTooltip({
  points,
  positive,
  currentPrice,
  height = 48,
  timestamps = [],
  period = "1D",
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

  const toX = (i) => (i / (points.length - 1)) * W;
  const toY = (v) => H - ((v - min) / range) * (H - 6) - 3;

  const coords = points.map((p, i) => `${toX(i)},${toY(p)}`);
  const color = positive ? "#16A34A" : "#EF4444";

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / rect.width) * (points.length - 1));
    const clamped = Math.max(0, Math.min(points.length - 1, idx));
    setHover({
      idx: clamped,
      price: points[clamped],
      x: (x / rect.width) * 100,
    });
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
          left: 0,
          top: `${toY(points[0])}px`,
          transform: "translateY(-50%)",
          background: "#7C3AED",
          filter: "drop-shadow(0 0 4px rgba(124, 58, 237, 0.7))",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          width: "6px",
          height: "6px",
          right: 0,
          top: `${toY(points[points.length - 1])}px`,
          transform: "translateY(-50%)",
          background: "#7C3AED",
          filter: "drop-shadow(0 0 4px rgba(124, 58, 237, 0.7))",
        }}
      />
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
