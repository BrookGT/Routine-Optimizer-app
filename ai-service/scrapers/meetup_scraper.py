"""
meetup_scraper.py — Public Meetup search results for Addis Ababa / Ethiopia.

No API key. Parses event links from server-rendered or Next.js HTML when available.
Often brittle if Meetup changes markup — failures return [] silently.
"""

from __future__ import annotations

import json
import logging
import re
import time

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, clean_text, normalise_category, parse_iso_date
from .image_helpers import fetch_og_image, sanitize_image_url

logger = logging.getLogger(__name__)

MEETUP_SEARCH_URLS = [
    "https://www.meetup.com/find/?location=Addis%20Ababa%2C%20Ethiopia&source=EVENTS",
    "https://www.meetup.com/find/?location=Ethiopia&source=EVENTS",
]

EVENT_LINK_RE = re.compile(r"https://www\.meetup\.com/[^/\s]+/events/\d+/[\w\-]*/?", re.I)


class MeetupEthiopiaScraper(BaseScraper):
    SOURCE_NAME = "meetup"

    def scrape(self) -> list[dict]:
        urls: list[str] = []
        for listing_url in MEETUP_SEARCH_URLS:
            try:
                resp = requests.get(
                    listing_url,
                    headers={**self.DEFAULT_HEADERS, "Accept": "text/html"},
                    timeout=18,
                )
                resp.raise_for_status()
            except requests.RequestException as exc:
                logger.info("[meetup] Listing unavailable (%s): %s", listing_url, exc)
                continue

            found = self._extract_event_urls(resp.text)
            urls.extend(found)
            time.sleep(1.2)

        seen: set[str] = set()
        unique = [u for u in urls if u not in seen and not seen.add(u)]  # type: ignore[func-returns-value]

        events: list[dict] = []
        for url in unique[:25]:
            ev = self._fetch_event_page(url)
            if ev:
                events.append(ev)
            time.sleep(0.9)

        logger.info("[meetup] Collected %d event(s)", len(events))
        return events

    def _extract_event_urls(self, html: str) -> list[str]:
        out: list[str] = []
        # Embedded JSON (Next.js)
        for m in re.finditer(r'"url"\s*:\s*"(https://www\.meetup\.com/[^"]+/events/\d+[^"]*)"', html):
            out.append(m.group(1).split("?")[0])
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.select('a[href*="/events/"]'):
            href = a.get("href") or ""
            if "meetup.com" in href and "/events/" in href:
                full = href if href.startswith("http") else "https://www.meetup.com" + href
                m = EVENT_LINK_RE.search(full)
                if m:
                    out.append(m.group(0).split("?")[0])
        for m in EVENT_LINK_RE.finditer(html):
            out.append(m.group(0).split("?")[0])
        return out

    def _fetch_event_page(self, url: str) -> dict | None:
        try:
            resp = requests.get(url, headers=self.DEFAULT_HEADERS, timeout=14)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.debug("[meetup] detail fail %s: %s", url, exc)
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        title = ""
        og_t = soup.find("meta", property="og:title")
        if og_t and og_t.get("content"):
            title = clean_text(og_t["content"])
        if not title and soup.title and soup.title.string:
            title = clean_text(soup.title.string.split("|")[0])

        desc = ""
        og_d = soup.find("meta", property="og:description")
        if og_d and og_d.get("content"):
            desc = clean_text(og_d["content"])

        image = ""
        og_i = soup.find("meta", property="og:image")
        if og_i and og_i.get("content"):
            image = sanitize_image_url(og_i["content"], url)
        if not image:
            image = fetch_og_image(url, self.DEFAULT_HEADERS) or ""

        date_iso = ""
        loc_name = "Addis Ababa"

        # JSON-LD
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if isinstance(item, dict) and item.get("@type") == "Event":
                        if not title:
                            title = clean_text(item.get("name", ""))
                        if not desc:
                            desc = clean_text(item.get("description", ""))
                        sd = item.get("startDate") or item.get("start_date") or ""
                        if sd and not date_iso:
                            date_iso = parse_iso_date(str(sd))
                        loc = item.get("location", {})
                        if isinstance(loc, dict) and loc.get("name"):
                            ln = clean_text(loc.get("name", ""))
                            if ln:
                                loc_name = ln
            except (json.JSONDecodeError, TypeError):
                continue

        if not title:
            return None

        category = normalise_category(f"{title} {desc}")
        return {
            "title": title,
            "description": desc[:1200],
            "location": loc_name,
            "date": date_iso,
            "category": category,
            "image": image,
            "source_url": url,
            "source": self.SOURCE_NAME,
        }
