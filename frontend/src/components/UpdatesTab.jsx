function SectionHeading({ children }) {
  return (
    <h2
      className="mb-3 text-sm font-semibold uppercase tracking-widest"
      style={{
        color: "#7C3AED",
        textShadow: "0 0 8px rgba(124, 58, 237, 0.5)",
      }}
    >
      {children}
    </h2>
  );
}

export default function UpdatesTab() {
  return (
    <div className="space-y-4">
    <div className="rounded-xl border border-slate-100 bg-white px-6 py-5 shadow-sm transition-colors dark:border-zinc-700/50 dark:bg-zinc-900">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        How news updates work
      </h1>

      <p className="mb-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        Peep into Pulse refreshes news at different rates based on US market
        activity (all times Eastern):
      </p>

      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        <div>
          <section className="mb-5">
            <SectionHeading>Weekdays</SectionHeading>
            <ul className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Pre-market (4:00 AM – 8:00 AM):
                </span>{" "}
                every 2 hours
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Pre-market (8:00 AM – 9:00 AM):
                </span>{" "}
                every 30 minutes
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Market hours (9:30 AM – 4:00 PM):
                </span>{" "}
                every 15 minutes
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  After-market (4:00 PM – 5:00 PM):
                </span>{" "}
                every 15 minutes
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  After-hours & Overnight (5:00 PM – 4:00 AM):
                </span>{" "}
                paused
              </li>
            </ul>
          </section>

          <section className="mb-5">
            <SectionHeading>Weekends</SectionHeading>
            <ul className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Saturday all day – Sunday 6 PM:
                </span>{" "}
                paused
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Sunday 6 PM – Monday 4 AM:
                </span>{" "}
                every 2 hours (Asian markets reopen)
              </li>
            </ul>
          </section>
        </div>

        <div>
          <section className="mb-5">
            <SectionHeading>Why this schedule?</SectionHeading>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              Most meaningful news breaks during market hours.
              <br />
              Pausing overnight and on weekends reduces costs without sacrificing
              relevance.
              <br />
              Prices and charts update every 60 seconds independently and are not
              affected by this schedule.
            </p>
          </section>

          <section className="mb-5">
            <SectionHeading>
              What the &ldquo;Updated X ago&rdquo; badge means
            </SectionHeading>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              This shows how long ago the last news refresh happened.
              <br />
              During market hours it will usually read 1–15 minutes.
              <br />
              Longer values are expected outside market hours.
            </p>
          </section>

          <section className="mb-5">
            <SectionHeading>⚡ What the bolt means</SectionHeading>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              The lightning bolt marks surprising or unexpected news.
              <br />
              It appears on items published within the last 10 hours.
              <br />
              After that, the item stays visible but loses the bolt — still
              important, just not &ldquo;breaking&rdquo; anymore.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              This applies to both Surprise Chips at the top of the Dashboard
              and items inside Internal/External news sections.
            </p>
          </section>

          <section className="mb-5">
            <SectionHeading>How far back news goes</SectionHeading>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              News articles older than 3 days are filtered out before reaching you.
              <br />
              This covers Friday evening news surviving the weekend pause through
              to Monday morning.
              <br />
              Small-cap tickers may have fewer items since their news cycles are
              sparser.
            </p>
          </section>
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-slate-100 bg-white px-6 py-5 shadow-sm transition-colors dark:border-zinc-700/50 dark:bg-zinc-900">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        Price & Chart Features
      </h1>

      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        <div>
          <section className="mb-5">
            <SectionHeading>After-Hours / Pre-Market Prices</SectionHeading>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              Each ticker in your watchlist shows the latest after-hours or
              pre-market price as &ldquo;AH&rdquo; or &ldquo;PRE&rdquo; below
              the main price. These update every 60 seconds whenever new data
              is available. Non-US tickers don&rsquo;t display AH/PRE prices.
            </p>
          </section>
        </div>

        <div>
          <section className="mb-5">
            <SectionHeading>Sparkline Indicators</SectionHeading>
            <p className="mb-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              On the 1D chart:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <li>
                Purple glow dots at both ends mark the day&rsquo;s open and
                close prices.
              </li>
              <li>
                Left-edge colored dot shows today&rsquo;s pre-market price
                (green if up, red if down from yesterday&rsquo;s close).
              </li>
              <li>
                Right-edge colored dot shows today&rsquo;s after-hours price
                (same color rule).
              </li>
              <li>
                Dashed vertical lines mark the 9:30 AM open and 4:00 PM close
                positions on the chart.
              </li>
            </ul>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              These indicators only appear on the 1D period. Switch to 5D or
              longer and the sparkline fills the full width as before.
            </p>
          </section>
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-slate-100 bg-white px-6 py-5 shadow-sm transition-colors dark:border-zinc-700/50 dark:bg-zinc-900">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        Dashboard & Tools
      </h1>

      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        <div>
          <section className="mb-5">
            <SectionHeading>Top Movers</SectionHeading>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              The Dashboard&rsquo;s lower section shows the day&rsquo;s biggest
              gainers, losers, and undervalued large caps from US markets.
              Updates throughout the trading day.
            </p>
          </section>

          <section className="mb-5">
            <SectionHeading>Compare Tab</SectionHeading>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              Plot multiple tickers on one chart. Switch between percent-return
              and price views, pick the time range, and hover to see each
              ticker&rsquo;s value at any point. The &ldquo;Now&rdquo; button
              jumps to the most recent data.
            </p>
          </section>
        </div>

        <div>
          <section className="mb-5">
            <SectionHeading>Customization</SectionHeading>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <li>Drag any watchlist item by its handle to reorder.</li>
              <li>Click a ticker in the watchlist to view its detail page.</li>
              <li>Choose sparkline period: 1D, 5D, 1M, 6M, 1Y, 5Y, Max.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
    </div>
  );
}
