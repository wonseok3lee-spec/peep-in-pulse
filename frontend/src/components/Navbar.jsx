import { useEffect, useRef, useState } from "react";
import { formatRelative } from "../lib/tags";
import { useTickerSearch } from "../hooks/useTickerSearch";
import { useDarkMode } from "../hooks/useDarkMode";
import { MoreIcon } from "./icons";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "compare", label: "Compare" },
  { key: "relations", label: "Relations" },
  { key: "updates", label: "Updates" },
];

export default function Navbar({
  activeTab,
  onTabChange,
  searchInput,
  onSearchChange,
  onSubmitTicker,
  lastUpdated,
}) {
  // Force re-render every 30s so "Updated X min ago" ticks forward.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef(null);
  const results = useTickerSearch(searchInput);
  const { isDark, toggle } = useDarkMode();

  useEffect(() => {
    setDropdownOpen(results.length > 0);
  }, [results]);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectResult = (symbol) => {
    onSubmitTicker(symbol);
    setDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-20 w-full border-b border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-colors dark:border-zinc-700/50 dark:bg-[#0B0F14] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
      <div className="flex w-full items-center gap-6 px-8 py-4">
        {/* Logo — purple pulse-line SVG + Inter 900 uppercase wordmark */}
        <div className="flex shrink-0 select-none items-center gap-2.5">
          <svg
            width="36"
            height="20"
            viewBox="0 0 48 24"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            stroke="#7C3AED"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "drop-shadow(0 0 6px rgba(124, 58, 237, 0.4))",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <path d="M2 12 L10 12 L14 4 L20 20 L26 8 L30 16 L38 12 L46 12" />
          </svg>
          <span
            className="text-slate-900 dark:text-slate-50"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: "18px",
              fontWeight: 900,
              letterSpacing: "0.01em",
              lineHeight: 1,
            }}
          >
            PEEP INTO PULSE
          </span>
        </div>

        {/* Tabs — active tab gets a short violet bar with soft glow */}
        <nav className="ml-8 flex shrink-0 items-center gap-1">
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                aria-current={active ? "page" : undefined}
                className={`relative px-4 py-2 text-sm font-semibold transition-all ${
                  active
                    ? "text-slate-900 dark:text-slate-100"
                    : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                }`}
              >
                {t.label}
                {active && (
                  <span className="absolute bottom-0 left-5 right-5 h-[3px] rounded-full bg-violet-500 shadow-[0_0_6px_rgba(124,58,237,0.5)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Search with prefix icon */}
        <form
          ref={searchRef}
          onSubmit={(e) => {
            e.preventDefault();
            // Do not add ticker on Enter — must select from dropdown
          }}
          className="relative mx-auto w-full max-w-xs"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => results.length > 0 && setDropdownOpen(true)}
            placeholder="Add name or ticker…"
            aria-label="Add ticker"
            className="w-full rounded-full border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-all focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-violet-500 dark:focus:ring-violet-900/40"
          />
          {dropdownOpen && results.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {results.map((r) => (
                <li
                  key={r.symbol}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectResult(r.symbol);
                  }}
                  className="cursor-pointer px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {r.symbol}
                  </span>
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    {r.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </form>

        {/* Dark mode toggle + updated indicator + overflow menu */}
        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={toggle}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {isDark ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7C3AED"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 6px rgba(124, 58, 237, 0.6))" }}
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7C3AED"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 6px rgba(124, 58, 237, 0.6))" }}
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-gain"
            />
            <span>Updated {formatRelative(lastUpdated, now)}</span>
          </span>
          <button
            type="button"
            aria-label="More"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <MoreIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
