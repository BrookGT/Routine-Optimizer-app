"""
facebook_public_scraper.py — Optional og:image scrape for explicit public event URLs.

Facebook blocks generic crawling; this module only fetches URLs you configure:

  FACEBOOK_PUBLIC_EVENT_URLS — newline-separated full URLs to single public
  events that open without login (often shared event links).

Requires no Graph API token. Empty env → scraper returns [].
"""

from __future__ import annotations

import logging
import os
import time

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, clean_text, normalise_category, parse_iso_date
from .image_helpers import sanitize_image_url

logger = logging.getLogger(__name__)


class FacebookPublicLinkScraper(BaseScraper):
    SOURCE_NAME = "facebook_public"

    def scrape(self) -> list[dict]:
        raw = os.getenv("FACEBOOK_PUBLIC_EVENT_URLS", "").strip()
        if not raw:
            logger.info("[facebook] FACEBOOK_PUBLIC_EVENT_URLS not set — skipping")
            return []

        urls = []
        for line in raw.splitlines():
            u = line.strip()
            if u.startswith("http") and "facebook.com" in u:
                urls.append(u.split("?")[0])

        seen: set[str] = set()
        uniq = [u for u in urls if u not in seen and not seen.add(u)]  # type: ignore[func-returns-value]

        events: list[dict] = []
        for url in uniq[:20]:
            ev = self._fetch_public_event(url)
            if ev:
                events.append(ev)
            time.sleep(1.2)

        logger.info("[facebook] Parsed %d event(s)", len(events))
        return events

    def _fetch_public_event(self, url: str) -> dict | None:
        try:
            resp = requests.get(url, headers=self.DEFAULT_HEADERS, timeout=16)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.debug("[facebook] fetch failed %s: %s", url, exc)
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        def meta_prop(key: str) -> str:
            tag = soup.find("meta", property=key)
            return clean_text(tag["content"]) if tag and tag.get("content") else ""

        def meta_name(key: str) -> str:
            tag = soup.find("meta", attrs={"name": key})
            return clean_text(tag["content"]) if tag and tag.get("content") else ""

        title = meta_prop("og:title") or ""
        if not title:
            return None

        description = meta_prop("og:description")
        image = sanitize_image_url(meta_prop("og:image"), url)

        raw_when = meta_name("event:start_time") or ""
        date_iso = parse_iso_date(raw_when) if raw_when else ""

        where = meta_name("event:location") or ""

        category = normalise_category(f"{title} {description}")

        return {
            "title": title,
            "description": description[:1200],
            "location": where or "Ethiopia",
            "date": date_iso,
            "category": category,
            "image": image,
            "source_url": url,
            "source": self.SOURCE_NAME,
        }
