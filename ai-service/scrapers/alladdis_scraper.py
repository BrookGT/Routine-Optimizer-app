"""
alladdis_scraper.py — Scraper for AllAddisEvents (alladdisevents.com).
"""

import logging
import time

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, clean_text, normalise_category
from .image_helpers import extract_image_from_img_tag, pick_best_image_from_container

logger = logging.getLogger(__name__)

BASE_URL = "https://www.alladdisevents.com"
EVENTS_URL = f"{BASE_URL}/events"

KNOWN_VENUES: dict[str, dict] = {
    "millennium hall":   {"lat": 9.0168, "lng": 38.7619},
    "skylight hotel":    {"lat": 9.0200, "lng": 38.7550},
    "sheraton":          {"lat": 9.0194, "lng": 38.7624},
    "hyatt":             {"lat": 9.0134, "lng": 38.7614},
    "hilton":            {"lat": 9.0097, "lng": 38.7624},
    "capitol hotel":     {"lat": 9.0165, "lng": 38.7640},
    "ghion hotel":       {"lat": 9.0204, "lng": 38.7631},
    "intercontinental":  {"lat": 9.0145, "lng": 38.7622},
    "national theatre":  {"lat": 9.0236, "lng": 38.7465},
    "unity park":        {"lat": 9.0271, "lng": 38.7636},
    "bole":              {"lat": 9.0096, "lng": 38.7978},
    "kazanchis":         {"lat": 9.0213, "lng": 38.7652},
    "addis ababa":       {"lat": 9.0320, "lng": 38.7469},
}


def _resolve_coordinates(location_text: str) -> dict:
    lower = location_text.lower()
    for keyword, coords in KNOWN_VENUES.items():
        if keyword in lower:
            return coords
    return {"lat": 9.0320, "lng": 38.7469}


class AllAddisScraper(BaseScraper):
    SOURCE_NAME = "alladdisevents"

    def scrape(self) -> list[dict]:
        events: list[dict] = []
        try:
            resp = requests.get(EVENTS_URL, headers=self.DEFAULT_HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("[alladdis] Failed to fetch listing page: %s", exc)
            return events

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = (
            soup.select(".event-card")
            or soup.select(".event-item")
            or soup.select("article.event")
            or soup.select(".events-list .item")
            or soup.select(".tribe-event")
            or soup.select("[class*='event']")
        )

        if not cards:
            logger.warning("[alladdis] No event cards found — site structure may have changed")
            return events

        for card in cards[:30]:
            try:
                event = self._parse_card(card)
                if event:
                    events.append(event)
            except Exception as exc:
                logger.debug("[alladdis] Card parse error: %s", exc)
            time.sleep(0.3)

        return events

    def _parse_card(self, card) -> dict | None:
        title_el = (
            card.select_one("h2") or card.select_one("h3")
            or card.select_one(".event-title") or card.select_one(".title")
            or card.select_one("a")
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
            card.select_one("time") or card.select_one(".event-date")
            or card.select_one(".date") or card.select_one("[class*='date']")
        )
        raw_date = ""
        if date_el:
            raw_date = date_el.get("datetime") or clean_text(date_el.get_text())

        loc_el = (
            card.select_one(".event-location") or card.select_one(".location")
            or card.select_one("[class*='location']") or card.select_one("[class*='venue']")
        )
        location = clean_text(loc_el.get_text()) if loc_el else "Addis Ababa"

        desc_el = (
            card.select_one(".event-description") or card.select_one(".description")
            or card.select_one("p")
        )
        description = clean_text(desc_el.get_text()) if desc_el else ""

        img_el = card.select_one("img")
        image = extract_image_from_img_tag(img_el, BASE_URL)
        if not image:
            image = pick_best_image_from_container(card, BASE_URL)

        combined = f"{title} {description}"
        category = normalise_category(combined)

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
