"""Time conversion helpers."""
from datetime import datetime, timezone


def unix_to_utc(ts: int | float) -> datetime:
    """Convert a unix epoch timestamp (seconds) to a UTC datetime."""
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def utc_to_hhmm(dt: datetime) -> str:
    """Format a UTC datetime as 'HH:MM' (24h)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%H:%M")


def hours_since(dt: datetime, now: datetime | None = None) -> float:
    """Return hours elapsed between `dt` and `now` (defaults to current UTC)."""
    if now is None:
        now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (now - dt).total_seconds() / 3600.0


def within_last_hours(dt: datetime, hours: float = 24.0) -> bool:
    """True if `dt` falls within the last `hours` hours (UTC)."""
    elapsed = hours_since(dt)
    return 0 <= elapsed <= hours
