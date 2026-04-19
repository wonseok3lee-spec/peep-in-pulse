/* Small SVG icon set. All use currentColor so Tailwind `text-*` tints them. */

export function BoltIcon({ className = "", style }) {
  // Heroicons 20-solid "bolt"
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        fillRule="evenodd"
        d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function MinusIcon({ className = "" }) {
  // Stroke-based so callers can tune thickness with Tailwind's stroke-[n]
  // utility (e.g. stroke-[2.5] on small sizes where the default 1.5 is thin).
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.75}
      aria-hidden="true"
      className={className}
    >
      <line x1="5" y1="10" x2="15" y2="10" />
    </svg>
  );
}

export function CheckIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function SearchIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function MoreIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 6a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm0 5.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm0 5.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "" }) {
  // Heroicons 20-solid "arrow-top-right-on-square"
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" />
      <path d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" />
    </svg>
  );
}

export function Dot({ color = "currentColor", size = 8, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full ${className}`}
      style={{ backgroundColor: color, width: size, height: size }}
    />
  );
}
