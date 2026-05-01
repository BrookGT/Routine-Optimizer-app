"""
scraper_manager.py — Orchestrates all event scrapers.

Responsibilities:
  1. Run all scrapers (AllAddis, WhatsUpAddis, Telegram).
  2. Deduplicate events using a hash of title + date + location.
  3. Save new events to Firestore `events` collection.
  4. Return a summary of inserted / skipped counts.
"""

import hashlib
import logging
import time
from datetime import datetime, timezone

from store.firebase_client import get_firestore

from .alladdis_scraper import AllAddisScraper
from .whatsupaddis_scraper import WhatsUpAddisScraper
from .telegram_scraper import TelegramScraper

logger = logging.getLogger(__name__)

EVENTS_COLLECTION = "events"


def _make_hash(title: str, date: str, location: str) -> str:
    """
    Create a stable deduplication hash from the event's key identifying fields.
    Normalise to lowercase and strip extra whitespace before hashing.
    """
    raw = f"{title.lower().strip()}|{date[:10]}|{location.lower().strip()}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _get_existing_hashes(db) -> set[str]:
    """Fetch all existing event hashes from Firestore for O(1) lookup."""
    try:
        snap = db.collection(EVENTS_COLLECTION).select(["hash"]).get()
        return {doc.to_dict().get("hash", "") for doc in snap if doc.to_dict().get("hash")}
    except Exception as exc:
        logger.warning("[manager] Could not load existing hashes: %s", exc)
        return set()


def run_all_scrapers() -> dict:
    """
    Execute all scrapers, deduplicate, and persist new events to Firestore.

    Returns a dict:
      {
        "total_scraped": int,
        "inserted": int,
        "skipped_duplicates": int,
        "sources": { source_name: count, ... },
        "ran_at": ISO string,
      }
    """
    scrapers = [
        AllAddisScraper(),
        WhatsUpAddisScraper(),
        TelegramScraper(),
    ]

    all_events: list[dict] = []

    for scraper in scrapers:
        logger.info("[manager] Running scraper: %s", scraper.SOURCE_NAME)
        events = scraper.run()
        for ev in events:
            all_events.append(ev)
        time.sleep(2)

    logger.info("[manager] Total raw events collected: %d", len(all_events))

    if not all_events:
        return {
            "total_scraped": 0,
            "inserted": 0,
            "skipped_duplicates": 0,
            "sources": {},
            "ran_at": datetime.now(timezone.utc).isoformat(),
        }

    db = get_firestore()
    existing_hashes = _get_existing_hashes(db)

    inserted = 0
    skipped = 0
    sources: dict[str, int] = {}
    now = datetime.now(timezone.utc).isoformat()

    for event in all_events:
        event_hash = _make_hash(
            event.get("title", ""),
            event.get("date", ""),
            event.get("location", ""),
        )

        if event_hash in existing_hashes:
            skipped += 1
            continue

        doc = {
            **event,
            "hash": event_hash,
            "created_at": now,
        }

        try:
            db.collection(EVENTS_COLLECTION).add(doc)
            existing_hashes.add(event_hash)
            inserted += 1
            src = event.get("source", "unknown")
            sources[src] = sources.get(src, 0) + 1
            logger.debug("[manager] Inserted event: %s", event.get("title"))
        except Exception as exc:
            logger.warning("[manager] Failed to insert event '%s': %s", event.get("title"), exc)

    logger.info(
        "[manager] Done — inserted=%d  skipped=%d  total_scraped=%d",
        inserted, skipped, len(all_events),
    )

    return {
        "total_scraped": len(all_events),
        "inserted": inserted,
        "skipped_duplicates": skipped,
        "sources": sources,
        "ran_at": now,
    }
