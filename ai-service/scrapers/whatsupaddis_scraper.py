"""
whatsupaddis_scraper.py — Scraper for WhatsUpAddis (whatsupaddis.com).
"""

import logging
import time

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, clean_text, normalise_category
from .image_helpers import extract_image_from_img_tag, pick_best_image_from_container

logger = logging.getLogger(__name__)

BASE_URL = "https://www.whatsupaddis.com"
EVENTS_URL = f"{BASE_URL}/events"

KNOWN_VENUES: dict[str, dict] = {
    "millennium hall": {"lat": 9.0168, "lng": 38.7619},
    "skylight":        {"lat": 9.0200, "lng": 38.7550},
    "sheraton":        {"lat": 9.0194, "lng": 38.7624},
    "hyatt":           {"lat": 9.0134, "lng": 38.7614},
    "hilton":          {"lat": 9.0097, "lng": 38.7624},
    "national theatre":{"lat": 9.0236, "lng": 38.7465},
    "unity park":      {"lat": 9.0271, "lng": 38.7636},
    "bole":            {"lat": 9.0096, "lng": 38.7978},
    "kazanchis":       {"lat": 9.0213, "lng": 38.7652},
    "piazza":          {"lat": 9.0384, "lng": 38.7527},
    "merkato":         {"lat": 9.0371, "lng": 38.7347},
    "addis ababa":     {"lat": 9.0320, "lng": 38.7469},
}


def _resolve_coordinates(location_text: str) -> dict:
    lower = location_text.lower()
    for keyword, coords in KNOWN_VENUES.items():
        if keyword in lower:
            return coords
    return {"lat": 9.0320, "lng": 38.7469}


class WhatsUpAddisScraper(BaseScraper):
    SOURCE_NAME = "whatsupaddis"

    def scrape(self) -> list[dict]:
        events: list[dict] = []
        for page_url in [EVENTS_URL, f"{EVENTS_URL}?page=2"]:
            page_events = self._scrape_page(page_url)
            events.extend(page_events)
            if not page_events:
                break
            time.sleep(1.5)
        return events

    def _scrape_page(self, url: str) -> list[dict]:
        events: list[dict] = []
        try:
            resp = requests.get(url, headers=self.DEFAULT_HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("[whatsupaddis] Failed to fetch %s: %s", url, exc)
            return events

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = (
            soup.select(".event-listing") or soup.select(".event-card")
            or soup.select(".event-item") or soup.select("article")
            or soup.select(".events .item") or soup.select("[class*='event']")
        )

        if not cards:
            logger.warning("[whatsupaddis] No cards found at %s", url)
            return events

        for card in cards[:20]:
            try:
                event = self._parse_card(card)
                if event:
                    events.append(event)
            except Exception as exc:
                logger.debug("[whatsupaddis] Card parse error: %s", exc)
        return events

    def _parse_card(self, card) -> dict | None:
        title_el = (
            card.select_one("h2") or card.select_one("h3") or card.select_one("h4")
            or card.select_one(".title") or card.select_one(".event-title")
        )
        title = clean_text(title_el.get_text()) if title_el else ""
        if not title:
            return None

        link_el = card.select_one("a[href]")
        source_url = ""
        if link_el:
            href = link_el.get("href", "")
            source_url = href if href.startswith("http") else f"{BASE_URL}{href}"

        date_el = (
            card.select_one("time") or card.select_one(".date")
            or card.select_one(".event-date") or card.select_one("[class*='date']")
        )
        raw_date = ""
        if date_el:
            raw_date = date_el.get("datetime") or clean_text(date_el.get_text())

        loc_el = (
            card.select_one(".venue") or card.select_one(".location")
            or card.select_one("[class*='venue']") or card.select_one("[class*='location']")
        )
        location = clean_text(loc_el.get_text()) if loc_el else "Addis Ababa"

        desc_el = (
            card.select_one(".description") or card.select_one(".excerpt")
            or card.select_one("p")
        )
        description = clean_text(desc_el.get_text()) if desc_el else ""

        img_el = card.select_one("img")
        image = extract_image_from_img_tag(img_el, BASE_URL)
        if not image:
            image = pick_best_image_from_container(card, BASE_URL)

        cat_el = card.select_one(".category") or card.select_one("[class*='category']")
        raw_cat = clean_text(cat_el.get_text()) if cat_el else ""
        category = normalise_category(raw_cat or f"{title} {description}")

        return {
            "title": title,
            "description": description,
            "location": location,
            "coordinates": _resolve_coordinates(location),
            "date": raw_date,
            "category": category,
            "image": image,
            "source_url": source_url,
        }
