"""
rss_feed_scraper.py — Event-like items from configurable RSS / Atom feeds.

Set SCRAPER_RSS_FEEDS to a comma-separated list of feed URLs, e.g.:
  SCRAPER_RSS_FEEDS=https://example.org/events.xml,https://other.org/feed

No feeds configured → scraper returns [] (no error).
"""

from __future__ import annotations

import logging
import os
import re
import xml.etree.ElementTree as ET
from html import unescape

import requests

from .base_scraper import BaseScraper, clean_text, normalise_category, parse_iso_date
from .image_helpers import sanitize_image_url

logger = logging.getLogger(__name__)

URL_IN_TEXT_RE = re.compile(r"https?://[^\s<>\"]+", re.I)


def _local(tag: str) -> str:
    if not tag:
        return ""
    return tag.split("}")[-1]


def _strip_tags(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    return clean_text(unescape(text))


def _parse_rss_datetime(node) -> str:
    for child in node:
        ln = _local(child.tag)
        if ln in ("pubDate", "dc:date", "published", "updated", "date"):
            if child.text and child.text.strip():
                return parse_iso_date(child.text.strip())
    return ""


class RssFeedScraper(BaseScraper):
    SOURCE_NAME = "rss_feed"

    def scrape(self) -> list[dict]:
        raw = os.getenv("SCRAPER_RSS_FEEDS", "").strip()
        if not raw:
            logger.info("[rss] SCRAPER_RSS_FEEDS not set — skipping")
            return []

        feed_urls = [u.strip() for u in raw.split(",") if u.strip().startswith("http")]
        events: list[dict] = []
        for feed_url in feed_urls[:12]:
            try:
                events.extend(self._parse_feed(feed_url))
            except Exception as exc:
                logger.warning("[rss] Feed failed %s: %s", feed_url, exc)
        logger.info("[rss] Total items: %d", len(events))
        return events

    def _parse_feed(self, feed_url: str) -> list[dict]:
        resp = requests.get(feed_url, headers=self.DEFAULT_HEADERS, timeout=18)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)

        items: list[dict] = []
        channel_title = ""

        channel = None
        for el in root.iter():
            if _local(el.tag) == "channel":
                channel = el
                break

        if channel is not None:
            for child in channel:
                if _local(child.tag) == "title" and child.text:
                    channel_title = clean_text(child.text)
                    break
            for child in channel:
                if _local(child.tag) == "item":
                    entry = self._item_from_rss(child, feed_url, channel_title)
                    if entry:
                        items.append(entry)
            return items

        # Atom — entries anywhere under root
        atom_entries = [e for e in root.iter() if _local(e.tag) == "entry"]
        for entry in atom_entries:
            ev = self._item_from_atom(entry, feed_url)
            if ev:
                items.append(ev)
        return items

    def _item_from_rss(self, item, feed_url: str, channel_title: str) -> dict | None:
        title = ""
        link = ""
        raw_desc = ""

        for child in item:
            ln = _local(child.tag)
            if ln == "title" and child.text:
                title = clean_text(child.text)
            elif ln == "link":
                link = (child.text or child.get("href") or "").strip()
            elif ln in ("description", "encoded"):
                raw_desc = child.text or ""

        if not title or len(title) < 4:
            return None

        description = _strip_tags(raw_desc)[:2000]

        img = ""
        for child in item:
            if _local(child.tag) == "thumbnail" and child.get("url"):
                img = sanitize_image_url(child.get("url", ""), link or feed_url)
                break
        if not img and raw_desc:
            m = re.search(r'src=["\'](https?://[^"\']+)["\']', raw_desc, re.I)
            if m:
                img = sanitize_image_url(m.group(1), link or feed_url)

        dt = _parse_rss_datetime(item)
        blob = f"{title} {description} {channel_title}"
        category = normalise_category(blob)

        if not link:
            m = URL_IN_TEXT_RE.search(description)
            if m:
                link = m.group(0).rstrip(").,;")

        return {
            "title": title,
            "description": description,
            "location": channel_title or "Ethiopia",
            "date": dt,
            "category": category,
            "image": img,
            "source_url": link or feed_url,
            "source": f"{self.SOURCE_NAME}:{feed_url[:48]}",
        }

    def _item_from_atom(self, entry, feed_url: str) -> dict | None:
        title = ""
        link = ""
        raw_summary = ""
        published = ""

        for child in entry:
            ln = _local(child.tag)
            if ln == "title" and child.text:
                title = clean_text(child.text)
            elif ln == "link" and child.get("href"):
                if not link or child.get("rel") in (None, "alternate"):
                    link = child.get("href") or ""
            elif ln in ("summary", "content"):
                raw_summary = child.text or ""
            elif ln in ("published", "updated") and child.text:
                published = parse_iso_date(child.text.strip())

        if not title:
            return None

        description = _strip_tags(raw_summary)[:2000]

        return {
            "title": title,
            "description": description,
            "location": "Ethiopia",
            "date": published,
            "category": normalise_category(f"{title} {description}"),
            "image": "",
            "source_url": link or feed_url,
            "source": f"{self.SOURCE_NAME}:{feed_url[:40]}",
        }
