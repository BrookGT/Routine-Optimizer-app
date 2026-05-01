"""
routers/scrape.py — POST /scrape

Triggers the full event scraping pipeline:
  1. Runs all configured scrapers (AllAddis, WhatsUpAddis, Telegram)
  2. Deduplicates and cleans results
  3. Persists new events to Firestore `events` collection

This endpoint is intended to be called by the backend cron job,
NOT by end users (protected by API key or internal network only).

Response:
  {
    "status": "ok",
    "total_scraped": int,
    "inserted": int,
    "skipped_duplicates": int,
    "sources": { source_name: count },
    "ran_at": "ISO string"
  }
"""

from __future__ import annotations

import logging
import os
import time

from fastapi import APIRouter, Header, HTTPException

from scrapers.scraper_manager import run_all_scrapers

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Scraping"])

# Optional internal API key to guard this endpoint.
# Set SCRAPER_API_KEY in .env; if absent, no auth is required (internal network only).
_SCRAPER_KEY = os.getenv("SCRAPER_API_KEY", "")


@router.post("/scrape", summary="Trigger full event scraping pipeline")
def trigger_scrape(x_scraper_key: str = Header(default="")):
    """
    Run all event scrapers, deduplicate, and persist new events.
    Returns a summary of what was inserted vs. skipped.
    """
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

    return {
        "status": "ok",
        "elapsed_ms": elapsed_ms,
        **result,
    }
