"""
base_scraper.py — Abstract base class for all event scrapers.

Every scraper must implement `scrape() -> list[dict]` and return
normalised event dicts matching the shared schema.
"""

import re
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {"music", "tech", "church", "fitness", "business", "food", "art", "sports", "education", "social", "other"}

# ─── Emoji / junk cleaner ─────────────────────────────────────────────────────

_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "]+",
    flags=re.UNICODE,
)

_WHITESPACE_RE = re.compile(r"\s+")


def clean_text(text: str) -> str:
    """Remove emojis, collapse whitespace, strip leading/trailing space."""
    if not text:
        return ""
    text = _EMOJI_RE.sub("", text)
    text = _WHITESPACE_RE.sub(" ", text)
    return text.strip()


def normalise_category(raw: str) -> str:
    """Map a free-form category string to one of VALID_CATEGORIES."""
    if not raw:
        return "other"
    r = raw.lower()
    for cat in VALID_CATEGORIES:
        if cat in r:
            return cat
    # Keyword mappings
    mapping = {
        "concert": "music",
        "live": "music",
        "band": "music",
        "dj": "music",
        "workshop": "tech",
        "seminar": "tech",
        "conference": "tech",
        "startup": "tech",
        "hackathon": "tech",
        "prayer": "church",
        "gospel": "church",
        "worship": "church",
        "run": "fitness",
        "yoga": "fitness",
        "gym": "fitness",
        "marathon": "fitness",
        "sport": "sports",
        "football": "sports",
        "basketball": "sports",
        "dining": "food",
        "restaurant": "food",
        "brunch": "food",
        "gallery": "art",
        "exhibition": "art",
        "networking": "business",
        "pitch": "business",
        "training": "education",
        "class": "education",
    }
    for kw, cat in mapping.items():
        if kw in r:
            return cat
    return "other"


def parse_iso_date(raw: str) -> str:
    """
    Attempt to parse a variety of date strings and return an ISO 8601 string.
    Falls back to current UTC time if parsing fails.
    """
    if not raw:
        return datetime.now(timezone.utc).isoformat()
    formats = [
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%d/%m/%Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%d %B %Y",
        "%d %b %Y",
        "%A, %B %d, %Y",
        "%A %d %B %Y",
    ]
    cleaned = clean_text(raw)
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    logger.debug("Could not parse date '%s' — using now", raw)
    return datetime.now(timezone.utc).isoformat()


class BaseScraper(ABC):
    """
    Abstract base class for event scrapers.

    Subclasses implement `scrape()` and return a list of event dicts.
    The base class provides `_normalise()` to enforce the shared schema.
    """

    SOURCE_NAME: str = "unknown"

    DEFAULT_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    @abstractmethod
    def scrape(self) -> list[dict]:
        """Fetch and return a list of raw event dicts."""

    def _normalise(self, raw: dict) -> dict | None:
        """
        Validate and normalise a raw event dict into the canonical schema.
        Returns None if required fields are missing.
        """
        title = clean_text(raw.get("title", ""))
        if not title:
            return None

        location = clean_text(raw.get("location", "Addis Ababa"))
        if not location:
            location = "Addis Ababa"

        date_str = parse_iso_date(raw.get("date", ""))
        category = normalise_category(raw.get("category", ""))
        description = clean_text(raw.get("description", ""))
        image = raw.get("image", "") or ""
        source_url = raw.get("source_url", "") or ""

        coords = raw.get("coordinates") or {}
        coordinates = {
            "lat": float(coords.get("lat", 9.0320)),
            "lng": float(coords.get("lng", 38.7469)),
        }

        return {
            "title": title,
            "description": description,
            "location": location,
            "coordinates": coordinates,
            "date": date_str,
            "category": category,
            "image": image,
            "source_url": source_url,
            "source": self.SOURCE_NAME,
        }

    def run(self) -> list[dict]:
        """
        Public entry point. Calls `scrape()`, normalises results, and
        filters out any None entries returned by `_normalise()`.
        """
        try:
            raw_events = self.scrape()
        except Exception as exc:
            logger.error("[%s] scrape() failed: %s", self.SOURCE_NAME, exc)
            return []

        normalised = []
        for raw in raw_events:
            event = self._normalise(raw)
            if event:
                normalised.append(event)

        logger.info("[%s] scraped %d valid event(s)", self.SOURCE_NAME, len(normalised))
        return normalised
