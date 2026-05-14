"""
telegram_scraper.py — Scrapes multiple Ethiopian public Telegram channels.

Each channel in ETHIOPIAN_EVENT_CHANNELS is scraped via the public t.me/s/
preview page. If TELEGRAM_BOT_TOKEN is set, the Bot API is also tried but
the preview fallback is always available without credentials.
"""

import logging
import os
import re
import time

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, clean_text, normalise_category, parse_iso_date

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
BOT_API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

# ─── Ethiopian event / entertainment Telegram channels ────────────────────────
# Add or remove channel usernames here; they must be public (t.me/s/<username>
# must return HTML without requiring a Telegram account).
ETHIOPIAN_EVENT_CHANNELS: list[str] = [
    os.getenv("TELEGRAM_CHANNEL", "EventsEthiopia"),   # env-override is always first
    "addisababaevents",
    "EthiopiaEventHub",
    "ethioentertainment",
    "AddisLifestyle",
    "addisababa_events",
    "EthioSports",
    "ConcertEthiopia",
    "AddisNightLife",
]
# Deduplicate while preserving order (env override may duplicate a hardcoded one)
seen: set[str] = set()
CHANNELS: list[str] = []
for _ch in ETHIOPIAN_EVENT_CHANNELS:
    _key = _ch.lower()
    if _key not in seen:
        seen.add(_key)
        CHANNELS.append(_ch)

DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b"),
    re.compile(
        r"\b(January|February|March|April|May|June|July|August|September|"
        r"October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", re.IGNORECASE),
]

LOCATION_KEYWORDS = [
    "at ", "venue:", "location:", "place:", "held at", "will be at",
    "taking place at", "in ", "@ ",
]


def _extract_date(text: str) -> str:
    for pat in DATE_PATTERNS:
        m = pat.search(text)
        if m:
            return parse_iso_date(m.group(0))
    return ""


def _extract_location(text: str) -> str:
    lines = text.split("\n")
    for line in lines:
        lower = line.lower()
        for kw in LOCATION_KEYWORDS:
            if kw in lower:
                after = line[lower.index(kw) + len(kw):].strip()
                candidate = after.split(",")[0].strip()
                if 3 < len(candidate) < 80:
                    return candidate
    return "Addis Ababa"


def _scrape_channel_preview(channel: str, default_headers: dict) -> list[dict]:
    """Scrape one public Telegram channel via its t.me/s/<channel> preview page."""
    url = f"https://t.me/s/{channel}"
    events: list[dict] = []
    try:
        resp = requests.get(
            url,
            headers={**default_headers, "Accept": "text/html"},
            timeout=15,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("[telegram/%s] Preview fetch failed: %s", channel, exc)
        return events

    soup = BeautifulSoup(resp.text, "html.parser")
    messages = soup.select(".tgme_widget_message")
    if not messages:
        logger.info("[telegram/%s] No messages on preview page (channel may be private/renamed)", channel)
        return events

    for msg in messages[:30]:
        event = _parse_preview_message(msg, channel)
        if event:
            events.append(event)
        time.sleep(0.1)

    logger.info("[telegram/%s] Collected %d events", channel, len(events))
    return events


def _parse_preview_message(msg, channel: str) -> dict | None:
    text_el = msg.select_one(".tgme_widget_message_text")
    if not text_el:
        return None

    full_text = clean_text(text_el.get_text(separator="\n"))
    if len(full_text) < 20:
        return None

    lines = [l.strip() for l in full_text.split("\n") if l.strip()]
    title = lines[0] if lines else full_text[:80]
    description = "\n".join(lines[1:]) if len(lines) > 1 else ""

    raw_date = _extract_date(full_text)
    location = _extract_location(full_text)
    category = normalise_category(f"{title} {description}")

    img_wrap = msg.select_one(".tgme_widget_message_photo_wrap")
    image = ""
    if img_wrap:
        style = img_wrap.get("style", "")
        m = re.search(r"url\(['\"]?(https?://[^'\")\s]+)['\"]?\)", style)
        if m:
            image = m.group(1)

    link_el = msg.select_one("a.tgme_widget_message_date")
    source_url = (
        link_el.get("href", f"https://t.me/{channel}") if link_el
        else f"https://t.me/{channel}"
    )

    return {
        "title": title,
        "description": description,
        "location": location,
        "date": raw_date,
        "category": category,
        "image": image,
        "source_url": source_url,
        # source field used by scraper_manager to count per-source stats
        "source": f"telegram_{channel.lower()}",
    }


class TelegramScraper(BaseScraper):
    """Iterates over all CHANNELS and collects events from each one."""

    SOURCE_NAME = "telegram"

    def scrape(self) -> list[dict]:
        all_events: list[dict] = []
        for channel in CHANNELS:
            channel_events = _scrape_channel_preview(channel, self.DEFAULT_HEADERS)
            all_events.extend(channel_events)
            # Polite delay between channels
            time.sleep(1.5)
        logger.info("[telegram] Total events across %d channels: %d", len(CHANNELS), len(all_events))
        return all_events
