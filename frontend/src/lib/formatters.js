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
