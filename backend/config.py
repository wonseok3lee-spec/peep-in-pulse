"""Configuration: tickers and environment variables."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (one level up from backend/)
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

TICKERS = ["MSFT", "ORCL"]

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def _diagnose() -> None:
    """Print where we looked, whether .env exists, and key status — safely.

    Never prints any part of the key itself (not even a prefix/suffix).
    """
    print(f".env path    : {ENV_PATH}")
    print(f".env exists  : {ENV_PATH.exists()}")

    if not OPENAI_API_KEY:
        print("OPENAI_API_KEY: NOT LOADED (empty / missing)")
        return

    is_placeholder = OPENAI_API_KEY == "your_key_here"
    looks_like_openai = OPENAI_API_KEY.startswith("sk-")
    print(f"OPENAI_API_KEY: loaded (length={len(OPENAI_API_KEY)})")
    print(f"  placeholder?  {is_placeholder}")
    print(f"  'sk-' prefix? {looks_like_openai}")


if __name__ == "__main__":
    _diagnose()
