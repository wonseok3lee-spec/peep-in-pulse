export default function UpdatesTab() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-6 py-6 shadow-sm transition-colors dark:border-zinc-700/50 dark:bg-zinc-900">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        How news updates work
      </h1>

      <p className="mb-8 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        Peep into Pulse refreshes news at different rates based on US market
        activity (all times Eastern):
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Weekdays
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <li>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Pre-market (4:00 AM – 9:00 AM):
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
              After-market (4:00 PM, 6:00 PM):
            </span>{" "}
            twice only
          </li>
          <li>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Overnight (8:00 PM – 4:00 AM):
            </span>{" "}
            paused
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Weekends
        </h2>
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
            every hour (Asian markets reopen)
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Why this schedule?
        </h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          Most meaningful news breaks during market hours. Pausing overnight
          and on weekends reduces costs without sacrificing relevance. Prices
          and charts update every 60 seconds independently and are not
          affected by this schedule.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          What the &ldquo;Updated X ago&rdquo; badge means
        </h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          This shows how long ago the last news refresh happened. During
          market hours it will usually read 1–15 minutes. Longer values are
          expected outside market hours.
        </p>
      </section>
    </div>
  );
}
