# Scraper package — lazy exports so `from scrapers.base_scraper import …` does not
# pull every scraper (and heavy deps) at import time.

from __future__ import annotations

import importlib

__all__ = [
    "AllAddisScraper",
    "CultureVenueScraper",
    "EventbriteScraper",
    "FacebookPublicLinkScraper",
    "MeetupEthiopiaScraper",
    "RssFeedScraper",
    "TelegramScraper",
    "WhatsUpAddisScraper",
]

_SCRAPER_MODULES: dict[str, str] = {
    "AllAddisScraper": ".alladdis_scraper",
    "CultureVenueScraper": ".culture_venue_scraper",
    "EventbriteScraper": ".eventbrite_scraper",
    "FacebookPublicLinkScraper": ".facebook_public_scraper",
    "MeetupEthiopiaScraper": ".meetup_scraper",
    "RssFeedScraper": ".rss_feed_scraper",
    "TelegramScraper": ".telegram_scraper",
    "WhatsUpAddisScraper": ".whatsupaddis_scraper",
}


def __getattr__(name: str):
    if name not in _SCRAPER_MODULES:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    mod = importlib.import_module(_SCRAPER_MODULES[name], __name__)
    return getattr(mod, name)
