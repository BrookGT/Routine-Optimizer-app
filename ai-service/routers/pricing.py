"""
routers/pricing.py — Place pricing intelligence endpoints.

POST /pricing/classify
  Body: {"place": {... place dict ...}}
  Returns: {"priceLevel", "priceConfidence", "priceSignals",
            "estimatedCost", "priceCategory"}

POST /pricing/classify/batch
  Body: {"places": [<place>, ...]}
  Returns: {"results": [{"placeId": "...", ...enrichment}, ...]}

GET /pricing/dataset
  Returns the full Ethiopian benchmark dataset (debug / admin / mobile fallback).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from pricing import enrich_place
from pricing.dataset import PRICE_RANGES, budget_amount_to_tier, budget_label_normalize

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Pricing"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    place: dict[str, Any]


class ClassifyBatchRequest(BaseModel):
    places: list[dict[str, Any]] = []


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/pricing/classify")
def classify(body: ClassifyRequest) -> dict[str, Any]:
    enrichment = enrich_place(body.place)
    return enrichment


@router.post("/pricing/classify/batch")
def classify_batch(body: ClassifyBatchRequest) -> dict[str, Any]:
    out: list[dict[str, Any]] = []
    for p in body.places:
        enrichment = enrich_place(p)
        enrichment["placeId"] = p.get("id") or p.get("place_id") or ""
        out.append(enrichment)
    return {"results": out}


@router.get("/pricing/dataset")
def dataset() -> dict[str, Any]:
    """Returns the canonical Ethiopian price benchmarks dataset."""
    # Convert tuples → lists so it's JSON-serialisable
    serialisable: dict[str, dict[str, dict[str, list[float | None]]]] = {}
    for cat, tiers in PRICE_RANGES.items():
        serialisable[cat] = {}
        for tier, items in tiers.items():
            serialisable[cat][tier] = {
                k: [v[0], v[1]] for k, v in items.items()
            }
    return {"currency": "ETB", "ranges": serialisable}


# ── Budget normalisation helper (used by backend before /predict) ────────────
class BudgetNormalizeRequest(BaseModel):
    weeklyBudget: float | int | None = None
    budgetRange:  str | None = None


@router.post("/pricing/normalize-budget")
def normalize_budget(body: BudgetNormalizeRequest) -> dict[str, str]:
    """
    Normalises an arbitrary budget input to the canonical 'cheap|mid|expensive'.

    Priority:
      1. If `weeklyBudget` (number) given, use the numeric mapping
      2. Else fall back to `budgetRange` label aliases
    """
    if body.weeklyBudget is not None:
        return {"budget": budget_amount_to_tier(body.weeklyBudget)}
    return {"budget": budget_label_normalize(body.budgetRange)}
