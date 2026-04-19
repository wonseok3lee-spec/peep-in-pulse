import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Render tooltip via portal to <body> so it escapes ancestor overflow-hidden
// (e.g. the quadrant cards' rounded corner clipping). Uses position: fixed
// + viewport-aware placement: prefers above the trigger, flips below when
// there isn't room; clamps horizontally so it never leaves the viewport.
function TooltipPortal({ triggerRect, children, className = "", style = {} }) {
  const tooltipRef = useRef(null);
  // Start offscreen so the first paint (pre-measure) doesn't flash at (0,0).
  const [pos, setPos] = useState({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    if (!triggerRect || !tooltipRef.current) return;
    const tt = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 8;

    const spaceAbove = triggerRect.top;
    const spaceBelow = vh - triggerRect.bottom;
    let top =
      spaceAbove >= tt.height + GAP || spaceAbove >= spaceBelow
        ? triggerRect.top - tt.height - GAP
        : triggerRect.bottom + GAP;
    if (top < 8) top = 8;
    if (top + tt.height > vh - 8) top = vh - tt.height - 8;

    let left = triggerRect.left;
    if (left + tt.width > vw - 8) left = vw - tt.width - 8;
    if (left < 8) left = 8;

    setPos({ top, left });
  }, [triggerRect]);

  return createPortal(
    <div
      ref={tooltipRef}
      className={`pointer-events-none fixed z-[9999] ${className}`}
      style={{ top: pos.top, left: pos.left, ...style }}
    >
      {children}
    </div>,
    document.body
  );
}

/**
 * Wrapper that shows a custom tooltip near the wrapped element on hover.
 * Placement flips above/below based on viewport space.
 * Usage:
 *   <HoverTooltip content="Full text here">
 *     <span>Truncated...</span>
 *   </HoverTooltip>
 */
export function HoverTooltip({ content, children, className = "" }) {
  const [show, setShow] = useState(false);
  const [triggerRect, setTriggerRect] = useState(null);

  if (!content) return children;

  return (
    <span
      className={`relative inline-block ${className}`}
      onMouseEnter={(e) => {
        setTriggerRect(e.currentTarget.getBoundingClientRect());
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <TooltipPortal
          triggerRect={triggerRect}
          className="whitespace-normal rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-normal text-slate-700 shadow-[0_0_20px_rgba(124,58,237,0.25)] dark:border-violet-500 dark:bg-zinc-900 dark:text-slate-200"
          style={{ minWidth: "240px", maxWidth: "420px" }}
        >
          {content}
        </TooltipPortal>
      )}
    </span>
  );
}

/**
 * Variant for multi-line content (used for "+N more hidden" headline list).
 */
export function HoverTooltipList({ items, children, className = "" }) {
  const [show, setShow] = useState(false);
  const [triggerRect, setTriggerRect] = useState(null);

  if (!items || items.length === 0) return children;

  return (
    <span
      className={`relative inline-block ${className}`}
      onMouseEnter={(e) => {
        setTriggerRect(e.currentTarget.getBoundingClientRect());
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <TooltipPortal
          triggerRect={triggerRect}
          className="whitespace-normal rounded-lg border border-violet-300 bg-white px-3 py-2 shadow-[0_0_20px_rgba(124,58,237,0.25)] dark:border-violet-500 dark:bg-zinc-900"
          style={{ minWidth: "300px", maxWidth: "500px" }}
        >
          <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-200">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-1.5 leading-snug">
                <span className="shrink-0 text-violet-400">•</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </TooltipPortal>
      )}
    </span>
  );
}
