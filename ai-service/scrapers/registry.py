"""
registry.py — Ordered list of event scraper classes with priority hints.

Higher *priority* numbers win when merging duplicate events (better metadata).
Failures are isolated per scraper in scraper_manager.
"""

from __future__ import annotations

from typing import Callable

from .alladdis_scraper import AllAddisScraper
from .eventbrite_scraper import EventbriteScraper
from .whatsupaddis_scraper import WhatsUpAddisScraper
from .telegram_scraper import TelegramScraper

# Optional / env-driven scrapers imported lazily to avoid hard deps at import time
from .meetup_scraper import MeetupEthiopiaScraper
from .rss_feed_scraper import RssFeedScraper
from .culture_venue_scraper import CultureVenueScraper
from .facebook_public_scraper import FacebookPublicLinkScraper

ScraperFactory = Callable[[], object]

# (priority, factory) — factory returns a scraper instance with .run()
SCRAPER_FACTORIES: list[tuple[int, ScraperFactory]] = [
    (100, lambda: EventbriteScraper()),
    (92, lambda: MeetupEthiopiaScraper()),
    (88, lambda: AllAddisScraper()),
    (88, lambda: WhatsUpAddisScraper()),
    (82, lambda: CultureVenueScraper()),
    (75, lambda: RssFeedScraper()),
    (70, lambda: FacebookPublicLinkScraper()),
    # Broad Telegram harvest — lower priority than curated web listings
    (55, lambda: TelegramScraper()),
]


def iter_scraper_factories_ordered() -> list[tuple[int, ScraperFactory]]:
    return sorted(SCRAPER_FACTORIES, key=lambda x: -x[0])
