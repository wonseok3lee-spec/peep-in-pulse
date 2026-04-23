const CURRENCY_SYMBOLS = {
  USD: "$",
  KRW: "₩",
  JPY: "¥",
  EUR: "€",
  GBP: "£",
  HKD: "HK$",
  CNY: "¥",
};

export function formatPrice(price, currency = "USD") {
  if (price == null) return "--";
  const symbol = CURRENCY_SYMBOLS[currency] ?? "";
  if (currency === "KRW" || currency === "JPY") {
    return `${symbol}${Math.round(price).toLocaleString("en-US")}`;
  }
  return `${symbol}${price.toFixed(2)}`;
}

// Compares a unix-second timestamp to "now" as a calendar day in
// America/New_York. Used by the AH display rule: we keep showing the
// after-hours price through the CLOSED window (8 PM – next 4 AM) as long
// as the bar is still from "today" in ET; weekend stalemates naturally
// fall through because Friday's AH is no longer today by Saturday.
export function isSameEtDay(unixSeconds, nowMs = Date.now()) {
  if (unixSeconds == null) return false;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(unixSeconds * 1000)) === fmt.format(new Date(nowMs));
}
