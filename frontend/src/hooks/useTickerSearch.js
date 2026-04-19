import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

export function useTickerSearch(query) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/proxy/search?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        const quotes = data?.quotes ?? [];
        // Re-rank Yahoo's fuzzy results so an exact symbol match always
        // lands first, then prefix matches, then everything else. Yahoo
        // otherwise buries e.g. "PBF" behind "PB", "PBR", "PBR-A" when
        // searching "pbf", which confuses users typing a known ticker.
        const q = query.trim().toUpperCase();
        const ranked = quotes
          .filter((item) => item.quoteType === "EQUITY")
          .map((item) => {
            const sym = (item.symbol || "").toUpperCase();
            let rank = 2;
            if (sym === q) rank = 0;
            else if (sym.startsWith(q)) rank = 1;
            return { ...item, __rank: rank };
          })
          .sort((a, b) => {
            if (a.__rank !== b.__rank) return a.__rank - b.__rank;
            // Preserve Yahoo's ordering within each tier.
            return (b.score ?? 0) - (a.score ?? 0);
          });
        setResults(
          ranked.slice(0, 6).map((item) => ({
            symbol: item.symbol,
            name: item.shortname || item.longname || item.symbol,
          }))
        );
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return results;
}
