# scrapers package — registry-driven multi-source pipeline (see scraper_manager / registry)
from .alladdis_scraper import AllAddisScraper
from .culture_venue_scraper import CultureVenueScraper
from .eventbrite_scraper import EventbriteScraper
from .facebook_public_scraper import FacebookPublicLinkScraper
from .meetup_scraper import MeetupEthiopiaScraper
from .rss_feed_scraper import RssFeedScraper
from .telegram_scraper import TelegramScraper
from .whatsupaddis_scraper import WhatsUpAddisScraper

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
