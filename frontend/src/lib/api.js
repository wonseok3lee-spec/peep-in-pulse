// Base URL for backend API. Set VITE_API_URL in .env.local (dev) or
// deployment environment (prod). Falls back to localhost:8000 so a
// forgotten env var doesn't surface as a blank-screen runtime error —
// at worst it points at a non-running backend, which the hooks'
// existing error states already handle.
export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
