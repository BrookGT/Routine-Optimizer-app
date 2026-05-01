"""
telegram_scraper.py — Scraper for Telegram public channels via the
Telegram Bot API (no Telethon / MTProto required).

Uses the getUpdates / forwardMessage-free approach:
  - Fetches recent messages from a public channel using the Bot API
    `getChatHistory` workaround via `getUpdates` on a forwarding bot,
    OR reads from a public channel via the public t.me preview page
    (HTML scraping fallback — always works without a bot token).

Environment variables:
  TELEGRAM_BOT_TOKEN  — Optional. If set, uses Bot API for richer data.
  TELEGRAM_CHANNEL    — Channel username (default: EventsEthiopia)
"""

import logging
import os
import re
import time

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, clean_text, normalise_category, parse_iso_date

logger = logging.getLogger(__name__)

CHANNEL = os.getenv("TELEGRAM_CHANNEL", "EventsEthiopia")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
PREVIEW_URL = f"https://t.me/s/{CHANNEL}"
BOT_API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

# Patterns to extract dates from message text
DATE_PATTERNS = [
    re.compile(
        r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b"
    ),
    re.compile(
        r"\b(January|February|March|April|May|June|July|August|September|"
        r"October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b",
        re.IGNORECASE,
    ),
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


class TelegramScraper(BaseScraper):
    SOURCE_NAME = "telegram_events_ethiopia"

    def scrape(self) -> list[dict]:
        if BOT_TOKEN:
            return self._scrape_via_bot()
        return self._scrape_via_preview()

    # ── Public channel preview (no bot token needed) ──────────────────────────

    def _scrape_via_preview(self) -> list[dict]:
        events: list[dict] = []

        try:
            resp = requests.get(
                PREVIEW_URL,
                headers={**self.DEFAULT_HEADERS, "Accept": "text/html"},
                timeout=15,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("[telegram] Preview fetch failed: %s", exc)
            return events

        soup = BeautifulSoup(resp.text, "html.parser")

        messages = soup.select(".tgme_widget_message")
        if not messages:
            logger.warning("[telegram] No messages found in preview page")
            return events

        for msg in messages[:25]:
            event = self._parse_preview_message(msg)
            if event:
                events.append(event)
            time.sleep(0.2)

        return events

    def _parse_preview_message(self, msg) -> dict | None:
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

        # Image
        img_wrap = msg.select_one(".tgme_widget_message_photo_wrap")
        image = ""
        if img_wrap:
            style = img_wrap.get("style", "")
            m = re.search(r"url\(['\"]?(https?://[^'\")\s]+)['\"]?\)", style)
            if m:
                image = m.group(1)

        # Message link
        link_el = msg.select_one("a.tgme_widget_message_date")
        source_url = link_el.get("href", f"https://t.me/{CHANNEL}") if link_el else f"https://t.me/{CHANNEL}"

        return {
            "title": title,
            "description": description,
            "location": location,
            "date": raw_date,
            "category": category,
            "image": image,
            "source_url": source_url,
        }

    # ── Bot API path (richer, requires TELEGRAM_BOT_TOKEN) ───────────────────

    def _scrape_via_bot(self) -> list[dict]:
        """
        Uses getUpdates to retrieve forwarded messages if the bot is a member
        of the channel, or falls back to preview scraping.
        """
        events: list[dict] = []

        try:
            resp = requests.get(
                f"{BOT_API_BASE}/getUpdates",
                params={"limit": 50, "allowed_updates": ["channel_post"]},
                timeout=15,
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning("[telegram] Bot API returned not-ok; falling back to preview")
                return self._scrape_via_preview()

            for update in data.get("result", []):
                post = update.get("channel_post", {})
                if not post:
                    continue
                chat = post.get("chat", {})
                if chat.get("username", "").lower() != CHANNEL.lower():
                    continue
                event = self._parse_bot_message(post)
                if event:
                    events.append(event)

        except Exception as exc:
            logger.warning("[telegram] Bot API error: %s — falling back to preview", exc)
            return self._scrape_via_preview()

        return events or self._scrape_via_preview()

    def _parse_bot_message(self, post: dict) -> dict | None:
        text = clean_text(post.get("text") or post.get("caption") or "")
        if len(text) < 20:
            return None

        lines = [l.strip() for l in text.split("\n") if l.strip()]
        title = lines[0][:120]
        description = "\n".join(lines[1:])

        raw_date = _extract_date(text)
        location = _extract_location(text)
        category = normalise_category(f"{title} {description}")

        image = ""
        if post.get("photo"):
            largest = max(post["photo"], key=lambda p: p.get("file_size", 0))
            file_id = largest.get("file_id", "")
            if file_id and BOT_TOKEN:
                try:
                    fr = requests.get(
                        f"{BOT_API_BASE}/getFile",
                        params={"file_id": file_id},
                        timeout=5,
                    )
                    fdata = fr.json()
                    if fdata.get("ok"):
                        path = fdata["result"]["file_path"]
                        image = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{path}"
                except Exception:
                    pass

        msg_id = post.get("message_id", "")
        source_url = f"https://t.me/{CHANNEL}/{msg_id}" if msg_id else f"https://t.me/{CHANNEL}"

        return {
            "title": title,
            "description": description,
            "location": location,
            "date": raw_date,
            "category": category,
            "image": image,
            "source_url": source_url,
        }
