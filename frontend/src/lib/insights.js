/**
 * Generate a combined-metric insight for a ticker based on fundamentals.
 * Returns { headline: string, tone: "bullish" | "bearish" | "neutral" | "mixed" }
 * or null when no fundamentals are available.
 *
 * Rules fire in priority order — first match wins. Strongest signals first,
 * catch-all "Steady performer" last.
 */
export function buildInsight(fund) {
  if (!fund || fund.error) return null;

  const pe = fund.trailingPE;
  const revGrowth = fund.revenueGrowth;
  const epsGrowth = fund.earningsGrowth;
  const beta = fund.beta;
  const margin = fund.profitMargin;

  // 1. EXTREME EARNINGS MOMENTUM — high PE justified by growth
  if (epsGrowth != null && epsGrowth > 0.4 && pe != null && pe > 30) {
    return {
      headline: `Premium priced, earnings momentum 🔥 (EPS +${Math.round(
        epsGrowth * 100
      )}%)`,
      tone: "bullish",
    };
  }

  // 2. CHEAP FOR A REASON — low PE but declining
  if (
    pe != null &&
    pe < 15 &&
    pe > 0 &&
    revGrowth != null &&
    revGrowth < -0.05
  ) {
    return {
      headline: `Cheap for a reason (revenue ${(revGrowth * 100).toFixed(0)}%)`,
      tone: "bearish",
    };
  }

  // 3. VALUE + GROWTH — ideal combo
  if (
    pe != null &&
    pe < 20 &&
    pe > 0 &&
    revGrowth != null &&
    revGrowth > 0.1
  ) {
    return {
      headline: `Reasonably priced, growing +${Math.round(
        revGrowth * 100
      )}% 💎`,
      tone: "bullish",
    };
  }

  // 4. HIGH BETA + STRONG GROWTH — risk paying off
  if (beta != null && beta > 1.5 && revGrowth != null && revGrowth > 0.15) {
    return {
      headline: `High volatility (β ${beta.toFixed(1)}), strong growth`,
      tone: "bullish",
    };
  }

  // 5. HIGH BETA + NEGATIVE GROWTH — red flag
  if (beta != null && beta > 1.5 && revGrowth != null && revGrowth < 0) {
    return {
      headline: `High risk (β ${beta.toFixed(1)}) + shrinking revenue ⚠️`,
      tone: "bearish",
    };
  }

  // 6. DEFENSIVE — low beta, stable margins
  if (beta != null && beta < 0.8 && margin != null && margin > 0.15) {
    return {
      headline: `Defensive — low beta (${beta.toFixed(2)}), ${Math.round(
        margin * 100
      )}% margins`,
      tone: "neutral",
    };
  }

  // 7. OVERVALUED — very high PE, weak growth
  if (pe != null && pe > 50 && revGrowth != null && revGrowth < 0.1) {
    return {
      headline: `Overvalued? PE ${pe.toFixed(0)}, growth only +${Math.round(
        revGrowth * 100
      )}%`,
      tone: "bearish",
    };
  }

  // 8. NO EARNINGS — negative or missing PE
  if (pe == null || pe <= 0) {
    if (revGrowth != null && revGrowth > 0.2) {
      return {
        headline: `Not profitable yet, but growing +${Math.round(
          revGrowth * 100
        )}%`,
        tone: "mixed",
      };
    }
    return {
      headline: `No positive earnings reported`,
      tone: "bearish",
    };
  }

  // 9. STRONG MARGIN — quality business
  if (margin != null && margin > 0.25) {
    return {
      headline: `High-quality business (${Math.round(
        margin * 100
      )}% profit margin)`,
      tone: "bullish",
    };
  }

  // 10. NEGATIVE EPS GROWTH — earnings deterioration
  if (epsGrowth != null && epsGrowth < -0.15) {
    return {
      headline: `Earnings declining ${(epsGrowth * 100).toFixed(0)}% YoY`,
      tone: "bearish",
    };
  }

  return {
    headline: `Steady performer — no red flags`,
    tone: "neutral",
  };
}

/** Border/bg/text classes keyed on tone. */
export const TONE_STYLES = {
  bullish: "text-emerald-700 bg-emerald-50 border-emerald-200",
  bearish: "text-red-700 bg-red-50 border-red-200",
  neutral: "text-slate-600 bg-slate-50 border-slate-200",
  mixed: "text-amber-700 bg-amber-50 border-amber-200",
};
