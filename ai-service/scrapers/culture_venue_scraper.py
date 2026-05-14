"""
culture_venue_scraper.py — Cultural centres & public venue listing pages.

Fetches known institution pages that often list concerts, talks, and festivals.
Markup changes frequently; failures are non-fatal.
"""

from __future__ import annotations

import logging
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, clean_text, normalise_category, parse_iso_date
from .image_helpers import extract_image_from_img_tag, pick_best_image_from_container

logger = logging.getLogger(__name__)

SOURCES: list[tuple[str, str]] = [
    (
        "british_council_et",
        "https://www.britishcouncil.et/en/events",
    ),
    (
        "icc_addis",
        "https://iccaddis.org/events/",
    ),
]


class CultureVenueScraper(BaseScraper):
    SOURCE_NAME = "culture_venue"

    def scrape(self) -> list[dict]:
        events: list[dict] = []
        for src_key, url in SOURCES:
            try:
                events.extend(self._scrape_listing_page(src_key, url))
            except Exception as exc:
                logger.info("[culture] skip %s: %s", url, exc)
            time.sleep(1.5)
        logger.info("[culture] Total events: %d", len(events))
        return events

    def _scrape_listing_page(self, src_key: str, page_url: str) -> list[dict]:
        items: list[dict] = []
        resp = requests.get(page_url, headers=self.DEFAULT_HEADERS, timeout=18)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        cards = (
            soup.select("article")
            or soup.select(".event")
            or soup.select(".events article")
            or soup.select(".tribe-events-loop .type-tribe_events")
            or soup.select("[class*='event-item']")
            or soup.select(".card")
        )

        for card in cards[:24]:
            title_el = (
                card.select_one("h2") or card.select_one("h3") or card.select_one(".title")
                or card.select_one("a")
            )
            title = clean_text(title_el.get_text()) if title_el else ""
            if len(title) < 4:
                continue

            a = card.select_one("a[href]")
            source_url = page_url
            if a and a.get("href"):
                href = (a.get("href") or "").strip()
                source_url = href if href.startswith("http") else urljoin(page_url, href)

            date_el = card.select_one("time") or card.select_one(".date")
            raw_date = ""
            if date_el:
                raw_date = date_el.get("datetime") or clean_text(date_el.get_text())

            desc_el = card.select_one("p") or card.select_one(".excerpt")
            description = clean_text(desc_el.get_text()) if desc_el else ""

            img_url = extract_image_from_img_tag(card.select_one("img"), page_url)
            if not img_url:
                img_url = pick_best_image_from_container(card, page_url)

            category = normalise_category(f"{title} {description}")

            items.append({
                "title": title,
                "description": description[:1500],
                "location": "Addis Ababa",
                "coordinates": {"lat": 9.0320, "lng": 38.7469},
                "date": parse_iso_date(raw_date) if raw_date else "",
                "category": category,
                "image": img_url,
                "source_url": source_url if source_url.startswith("http") else page_url,
                "source": f"{self.SOURCE_NAME}_{src_key}",
            })

        return items
