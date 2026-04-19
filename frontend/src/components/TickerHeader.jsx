import { formatPrice } from "../lib/formatters";
import { usePrice } from "../hooks/usePrice";
import { useFundamentals } from "../hooks/useFundamentals";

const EXCHANGES = [
  { suffix: ".KS", label: "KOSPI" },
  { suffix: ".KQ", label: "KOSDAQ" },
  { suffix: ".T", label: "TSE" },
  { suffix: ".HK", label: "HKEX" },
  { suffix: ".L", label: "LSE" },
];

function getExchange(ticker) {
  if (!ticker) return null;
  for (const e of EXCHANGES) {
    if (ticker.endsWith(e.suffix)) return e.label;
  }
  return null;
}

function formatMarketCap(n) {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function formatPct(n, decimals = 1) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(decimals)}%`;
}

function StatItem({ label, value, tone = "neutral" }) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
      ? "text-red-500 dark:text-red-400"
      : "text-slate-900 dark:text-slate-100";
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[9px] font-semibold uppercase leading-tight tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span
        className={`mt-0.5 truncate font-mono text-[13px] font-semibold leading-tight ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function TickerHeader({ ticker }) {
  const { price, changePct, currency, companyName, loading, error } =
    usePrice(ticker);
  const { data: fundData } = useFundamentals(ticker ? [ticker] : []);
  const f = fundData[ticker];

  const priceOk = price != null && !error;
  const changeColor =
    changePct == null
      ? "text-slate-400 dark:text-slate-500"
      : changePct >= 0
      ? "text-gain"
      : "text-loss";
  const changeSign = changePct == null ? "" : changePct >= 0 ? "+" : "";
  const exchangeBadge = getExchange(ticker);

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm transition-colors dark:border-zinc-700/50 dark:bg-zinc-900">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-8 px-6 py-4">
        {/* COL 1: ticker + company */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-4xl font-bold leading-none tracking-tight text-slate-900 dark:text-slate-100">
              {ticker}
            </h1>
            {exchangeBadge && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-zinc-800 dark:text-slate-400">
                {exchangeBadge}
              </span>
            )}
          </div>
          <span className="max-w-[200px] truncate text-sm text-slate-500 dark:text-slate-400">
            {companyName ?? (loading ? "…" : ticker)}
          </span>
        </div>

        {/* COL 2: 4×2 stats grid */}
        {f && !f.error ? (
          <div className="grid min-w-0 grid-cols-4 gap-x-6 gap-y-2.5">
            <StatItem
              label="Mkt Cap"
              value={formatMarketCap(f.marketCap)}
            />
            <StatItem
              label="P/E"
              value={f.trailingPE ? f.trailingPE.toFixed(1) : "—"}
            />
            <StatItem
              label="Fwd P/E"
              value={f.forwardPE ? f.forwardPE.toFixed(1) : "—"}
            />
            <StatItem
              label="Beta"
              value={f.beta != null ? f.beta.toFixed(2) : "—"}
            />
            <StatItem
              label="Rev Grw"
              value={formatPct(f.revenueGrowth)}
              tone={
                f.revenueGrowth > 0
                  ? "positive"
                  : f.revenueGrowth < 0
                  ? "negative"
                  : "neutral"
              }
            />
            <StatItem
              label="EPS"
              value={f.trailingEPS ? `$${f.trailingEPS.toFixed(2)}` : "—"}
            />
            <StatItem
              label="EPS Grw"
              value={formatPct(f.earningsGrowth)}
              tone={
                f.earningsGrowth > 0
                  ? "positive"
                  : f.earningsGrowth < 0
                  ? "negative"
                  : "neutral"
              }
            />
            <StatItem
              label="Margin"
              value={formatPct(f.profitMargin)}
              tone={f.profitMargin > 0 ? "positive" : "negative"}
            />
          </div>
        ) : (
          <div />
        )}

        {/* COL 3: price + change */}
        <div className="shrink-0 text-right">
          <div className="font-mono text-3xl font-bold text-slate-900 dark:text-slate-100">
            {priceOk ? formatPrice(price, currency) : loading ? "…" : "--"}
          </div>
          <div className={`font-mono text-sm ${changeColor}`}>
            {priceOk && changePct != null
              ? `${changeSign}${changePct.toFixed(2)}%`
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
