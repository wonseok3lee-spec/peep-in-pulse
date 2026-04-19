import { BoltIcon, Dot } from "./icons";
import { HoverTooltipList } from "./HoverTooltip";
import { groupByQuadrant, parseTag, timeAgo } from "../lib/tags";

const MAX_INTERNAL = 7;
const MAX_EXTERNAL = 5;

function sortItems(items, sortMode) {
  if (sortMode === "recency") {
    return [...items].sort((a, b) => {
      const ta = a.published_time ? new Date(a.published_time).getTime() : 0;
      const tb = b.published_time ? new Date(b.published_time).getTime() : 0;
      return tb - ta;
    });
  }
  return [...items].sort((a, b) => {
    const score = (it) => {
      const { isHigh, hasSurprise } = parseTag(it.tag);
      if (isHigh && hasSurprise) return 3;
      if (isHigh) return 2;
      if (hasSurprise) return 1;
      return 0;
    };
    return score(b) - score(a);
  });
}

export default function QuadrantGrid({ items, sortMode = "priority" }) {
  const grouped = groupByQuadrant(items ?? []);

  const internalSorted = sortItems(grouped.internal, sortMode);
  const externalSorted = sortItems(grouped.external, sortMode);

  const visibleInternal = internalSorted.slice(0, MAX_INTERNAL);
  const hiddenInternal = internalSorted.length - visibleInternal.length;
  const visibleExternal = externalSorted.slice(0, MAX_EXTERNAL);
  const hiddenExternal = externalSorted.length - visibleExternal.length;

  return (
    <div className="w-full space-y-3">
      {/* INTERNAL — its own card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-2 dark:border-zinc-700/50 dark:bg-zinc-800">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Internal — directly about this company{" "}
            <span
              className="font-normal normal-case tracking-normal"
              style={{
                color: "#7C3AED",
                textShadow: "0 0 8px rgba(124, 58, 237, 0.5)",
              }}
            >
              (Headlines · Impact)
            </span>
          </span>
        </div>
        <div className="p-5">
          {internalSorted.length === 0 ? (
            <p className="text-xs italic text-slate-300">empty</p>
          ) : (
            <ul className="space-y-2.5">
              {visibleInternal.map((it, i) => (
                <Item key={i} item={it} />
              ))}
            </ul>
          )}
          {hiddenInternal > 0 && (
            <HoverTooltipList
              items={internalSorted
                .slice(visibleInternal.length)
                .map((it) => it.full_headline || it.headline)}
            >
              <p className="mt-2 w-fit cursor-help text-[10px] italic text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                +{hiddenInternal} more hidden (hover to see)
              </p>
            </HoverTooltipList>
          )}
        </div>
      </div>

      {/* EXTERNAL — its own card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-2 dark:border-zinc-700/50 dark:bg-zinc-800">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            External — market, macro & sector news{" "}
            <span
              className="font-normal normal-case tracking-normal"
              style={{
                color: "#7C3AED",
                textShadow: "0 0 8px rgba(124, 58, 237, 0.5)",
              }}
            >
              (Headlines · Impact)
            </span>
          </span>
        </div>
        <div className="p-5">
          {externalSorted.length === 0 ? (
            <p className="text-xs italic text-slate-300">empty</p>
          ) : (
            <ul className="space-y-2.5">
              {visibleExternal.map((it, i) => (
                <Item key={i} item={it} />
              ))}
            </ul>
          )}
          {hiddenExternal > 0 && (
            <HoverTooltipList
              items={externalSorted
                .slice(visibleExternal.length)
                .map((it) => it.full_headline || it.headline)}
            >
              <p className="mt-2 w-fit cursor-help text-[10px] italic text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                +{hiddenExternal} more hidden (hover to see)
              </p>
            </HoverTooltipList>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({ item }) {
  const { isHigh, hasSurprise } = parseTag(item.tag);

  // Dot is suppressed for medium+surprise — the bolt alone conveys it.
  let dotColor = null;
  if (isHigh) dotColor = "#EF4444";
  else if (!hasSurprise) dotColor = "#F59E0B";

  let textCls;
  if (hasSurprise) textCls = "font-medium text-[#6366F1] dark:text-indigo-300";
  else if (isHigh) textCls = "font-medium text-slate-900 dark:text-slate-100";
  else textCls = "text-slate-600 dark:text-slate-300";

  const inner = (
    <>
      {/* Column 1: icon + headline */}
      <div className="flex min-w-0 items-start gap-2">
        <div className="relative mt-[3px] flex w-3 shrink-0 items-center">
          {dotColor && <Dot color={dotColor} size={6} />}
          {hasSurprise && (
            <BoltIcon
              className={`absolute ${
                dotColor ? "-top-[1px]" : ""
              } left-[-1px] h-3 w-3 text-surprise`}
            />
          )}
        </div>
        <span
          className={`${textCls} line-clamp-2 block min-w-0 flex-1 ${
            item.url ? "group-hover:underline" : ""
          }`}
        >
          {item.full_headline || item.headline}
        </span>
      </div>

      {/* Column 2: summary (falls back to reason for back-compat) */}
      {item.summary || item.reason ? (
        <span className="line-clamp-1 block min-w-0 text-[11px] italic text-slate-500 dark:text-slate-400">
          {item.summary || item.reason}
        </span>
      ) : (
        <span />
      )}

      {/* Column 3: timestamp */}
      {item.published_time ? (
        <span className="mt-[2px] shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
          {timeAgo(item.published_time)}
        </span>
      ) : (
        <span />
      )}
    </>
  );

  return (
    <li className="text-xs leading-snug">
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="group -mx-2 grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_auto] items-start gap-3 rounded px-2 py-1 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
        >
          {inner}
        </a>
      ) : (
        <div className="-mx-2 grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_auto] items-start gap-3 px-2 py-1">
          {inner}
        </div>
      )}
    </li>
  );
}
