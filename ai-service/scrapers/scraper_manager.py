"""
scraper_manager.py — Orchestrates registered scrapers with isolation, dedup,
source-aware merging, and og:image back-fill for missing thumbnails.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timezone

from store.firebase_client import get_firestore

from .base_scraper import clean_text
from .image_helpers import fetch_og_image, is_usable_event_image
from .registry import iter_scraper_factories_ordered

logger = logging.getLogger(__name__)

EVENTS_COLLECTION = "events"

REG_URL_RE = re.compile(r"https?://[^\s)\]>]+", re.I)
REG_HINTS = (
    "ticket",
    "register",
    "rsvp",
    "eventbrite",
    "luma.",
    "meetup.com",
    "booking",
    "checkout",
    "seat",
)


def _norm_title(title: str) -> str:
    t = clean_text(title).lower()
    t = re.sub(r"[^\w\s]", " ", t)
    return " ".join(t.split())


def _norm_loc(location: str) -> str:
    return " ".join(clean_text(location).lower().split())[:120]


def _date_bucket(date_iso: str) -> str:
    if not date_iso:
        return ""
    return date_iso[:10] if len(date_iso) >= 10 else ""


def _make_hash(title: str, date: str, location: str) -> str:
    raw = f"{_norm_title(title)}|{_date_bucket(date)}|{_norm_loc(location)}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _legacy_make_hash(title: str, date: str, location: str) -> str:
    """Previous Firestore hash — matches older rows so we avoid duplicate inserts."""
    raw = f"{title.lower().strip()}|{date[:10]}|{location.lower().strip()}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _source_priority(source: str) -> int:
    s = (source or "").lower()
    if "eventbrite" in s:
        return 100
    if s.startswith("meetup"):
        return 92
    if "alladdis" in s:
        return 88
    if "whatsup" in s:
        return 88
    if "culture_venue" in s:
        return 82
    if s.startswith("rss_feed"):
        return 75
    if "facebook_public" in s:
        return 72
    if s.startswith("telegram_"):
        return 55
    return 45


def extract_registration_urls(description: str, source_url: str) -> list[str]:
    text = description or ""
    found = REG_URL_RE.findall(text)
    out: list[str] = []
    for u in found:
        low = u.lower().rstrip(").,;")
        if any(h in low for h in REG_HINTS):
            out.append(u.rstrip(").,;"))
    if source_url and source_url.startswith("http"):
        su = source_url.rstrip(").,;")
        if su not in out:
            out.insert(0, su)
    dedup: list[str] = []
    seen: set[str] = set()
    for u in out:
        if u not in seen:
            seen.add(u)
            dedup.append(u)
    return dedup[:6]


def _merge_event_group(group: list[dict]) -> dict:
    """Pick highest-priority row; fill gaps in image / URLs from others."""
    group = sorted(
        group,
        key=lambda e: _source_priority(str(e.get("source", ""))),
        reverse=True,
    )
    best = dict(group[0])
    for other in group[1:]:
        if not is_usable_event_image(best.get("image")):
            if is_usable_event_image(other.get("image")):
                best["image"] = other["image"]
        if not (best.get("source_url") or "").startswith("http"):
            ou = other.get("source_url") or ""
            if ou.startswith("http"):
                best["source_url"] = ou
        # Prefer longer description
        if len(other.get("description") or "") > len(best.get("description") or ""):
            best["description"] = other["description"]

    return best


def _dedupe_merge_events(events: list[dict]) -> list[dict]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    for ev in events:
        h = _make_hash(ev.get("title", ""), ev.get("date", ""), ev.get("location", ""))
        buckets[h].append(ev)

    merged: list[dict] = []
    for group in buckets.values():
        merged.append(_merge_event_group(group))
    return merged


def _enrich_missing_images(events: list[dict], headers: dict) -> None:
    max_fetch = int(os.getenv("SCRAPER_ENRICH_IMAGE_MAX", "40"))
    delay_s = float(os.getenv("SCRAPER_ENRICH_IMAGE_DELAY_S", "0.35"))
    count = 0
    for ev in events:
        if count >= max_fetch:
            break
        if is_usable_event_image(ev.get("image")):
            continue
        page = ev.get("source_url") or ""
        if not page.startswith("http"):
            continue
        img = fetch_og_image(page, headers)
        if img:
            ev["image"] = img
            count += 1
            logger.debug("[manager] Enriched image via og:%s", page[:60])
        time.sleep(delay_s)


def _get_existing_hashes(db) -> set[str]:
    try:
        snap = db.collection(EVENTS_COLLECTION).select(["hash", "legacy_hash"]).get()
        hashes: set[str] = set()
        for doc in snap:
            d = doc.to_dict()
            h = d.get("hash", "")
            if h:
                hashes.add(h)
            lh = d.get("legacy_hash", "")
            if lh:
                hashes.add(lh)
        return hashes
    except Exception as exc:
        logger.warning("[manager] Could not load existing hashes: %s", exc)
        return set()


def run_all_scrapers() -> dict:
    """Run all registered scrapers; merge duplicates; persist new docs."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    all_events: list[dict] = []
    source_errors: dict[str, str] = {}

    for priority, factory in iter_scraper_factories_ordered():
        scraper = None
        try:
            scraper = factory()
            name = getattr(scraper, "SOURCE_NAME", type(scraper).__name__)
            logger.info("[manager] Running scraper %s (prio=%s)", name, priority)
            batch = scraper.run()
            all_events.extend(batch)
        except Exception as exc:
            key = getattr(scraper, "SOURCE_NAME", type(scraper).__name__) if scraper else repr(factory)
            source_errors[key] = str(exc)
            logger.error("[manager] Scraper failed (%s): %s", key, exc)
        time.sleep(float(os.getenv("SCRAPER_DELAY_BETWEEN_SOURCES_S", "1.5")))

    logger.info("[manager] Raw events collected: %d", len(all_events))

    if not all_events:
        return {
            "total_scraped": 0,
            "inserted": 0,
            "skipped_duplicates": 0,
            "sources": {},
            "ran_at": datetime.now(timezone.utc).isoformat(),
            "errors": source_errors,
        }

    merged = _dedupe_merge_events(all_events)
    logger.info("[manager] After dedupe merge: %d", len(merged))

    _enrich_missing_images(merged, headers)

    db = get_firestore()
    existing_hashes = _get_existing_hashes(db)

    inserted = 0
    skipped = 0
    sources: dict[str, int] = {}
    now = datetime.now(timezone.utc).isoformat()

    for event in merged:
        event_hash = _make_hash(
            event.get("title", ""),
            event.get("date", ""),
            event.get("location", ""),
        )
        legacy_hash = _legacy_make_hash(
            event.get("title", ""),
            event.get("date", ""),
            event.get("location", ""),
        )

        if event_hash in existing_hashes or legacy_hash in existing_hashes:
            skipped += 1
            continue

        reg = extract_registration_urls(event.get("description", ""), event.get("source_url", ""))
        doc = {
            **event,
            "hash": event_hash,
            "legacy_hash": legacy_hash,
            "created_at": now,
            "scraped_at": now,
        }
        if reg:
            doc["registration_urls"] = reg

        try:
            db.collection(EVENTS_COLLECTION).add(doc)
            existing_hashes.add(event_hash)
            existing_hashes.add(legacy_hash)
            inserted += 1
            src = event.get("source", "unknown")
            sources[src] = sources.get(src, 0) + 1
        except Exception as exc:
            logger.warning("[manager] Failed to insert '%s': %s", event.get("title"), exc)

    logger.info("[manager] Done — inserted=%d skipped=%d merged_in=%d", inserted, skipped, len(merged))

    return {
        "total_scraped": len(all_events),
        "merged_unique": len(merged),
        "inserted": inserted,
        "skipped_duplicates": skipped,
        "sources": sources,
        "ran_at": now,
        "errors": source_errors,
    }
