"""
routers/scrape.py — POST /scrape

Triggers the full event scraping pipeline (registry-driven):

  * Runs Eventbrite, Meetup, AllAddis, WhatsUpAddis, culture/venue pages,
    optional RSS + optional Facebook public links, then multi-channel Telegram
  * Merges duplicates across sources with prioritised metadata & og:image fill-in
  * Persists new events to Firestore `events` collection

Protected by optional X-Scraper-Key header (set SCRAPER_API_KEY in .env).

Environment (optional):

  SCRAPER_RSS_FEEDS — comma-separated RSS/Atom feed URLs (university boards, blogs).
  FACEBOOK_PUBLIC_EVENT_URLS — newline-separated public Facebook event URLs (og scrape).
  SCRAPER_ENRICH_IMAGE_MAX — max og:image backfills per run (default 40).
"""

from __future__ import annotations

import logging
import os
import time

from fastapi import APIRouter, Header, HTTPException

from scrapers.scraper_manager import run_all_scrapers

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Scraping"])

_SCRAPER_KEY = os.getenv("SCRAPER_API_KEY", "")


@router.post("/scrape", summary="Trigger full event scraping pipeline")
def trigger_scrape(x_scraper_key: str = Header(default="")):
    """Run all event scrapers and return a summary of inserted vs. skipped events."""
    if _SCRAPER_KEY and x_scraper_key != _SCRAPER_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Scraper-Key header")

    logger.info("[scrape] Scraping triggered via API")
    start = time.time()

    try:
        result = run_all_scrapers()
    except Exception as exc:
        logger.error("[scrape] Pipeline error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Scraping pipeline error: {exc}") from exc

    elapsed_ms = int((time.time() - start) * 1000)
    logger.info("[scrape] Done in %d ms — inserted=%d", elapsed_ms, result["inserted"])

    return {"status": "ok", "elapsed_ms": elapsed_ms, **result}
