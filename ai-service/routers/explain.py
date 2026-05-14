"""
routers/explain.py — POST /explain

Generate a one-sentence "why we recommend this place" explanation tailored
to a specific user. Uses OpenAI when configured; falls back to a deterministic
template when the LLM is disabled or fails.

Request body:
  {
    "user_signals": {
       "budget": "cheap | mid | expensive",
       "interests": ["coffee", "gym"],
       "weekendPreference": "outdoor",
       "religion": "protestant",
       "session_intent": "explore",
       "time_of_day": "evening"
    },
    "place": {
       "id": "...", "name": "...", "type": "coffee",
       "priceLevel": "mid",
       "estimatedCost": {"meal": "600–1500 ETB"},
       "highlights": ["rooftop view"]
    }
  }

Response:
  { "reason": "<one short sentence>" }

Also exposes /explain/batch for bulk requests during recommendation
generation (one HTTP call vs N).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from llm import generate_recommendation_reason, summarize_reviews, is_llm_enabled

logger = logging.getLogger(__name__)
router = APIRouter(tags=["LLM"])


class ExplainRequest(BaseModel):
    user_signals: dict[str, Any] = {}
    place:        dict[str, Any] = {}
    max_chars:    int            = 160


class ExplainResponse(BaseModel):
    reason:      str
    llm_enabled: bool


class ExplainBatchItem(BaseModel):
    place: dict[str, Any]


class ExplainBatchRequest(BaseModel):
    user_signals: dict[str, Any] = {}
    items:        list[ExplainBatchItem] = []
    max_chars:    int = 160


class ExplainBatchResponse(BaseModel):
    reasons:     list[dict[str, Any]]
    llm_enabled: bool


class SummarizeReviewsRequest(BaseModel):
    reviews:   list[str] = []
    max_chars: int       = 240


class SummarizeReviewsResponse(BaseModel):
    summary:     str
    llm_enabled: bool


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/explain", response_model=ExplainResponse)
def explain(body: ExplainRequest) -> ExplainResponse:
    text = generate_recommendation_reason(
        body.user_signals,
        body.place,
        max_chars=body.max_chars,
    )
    return ExplainResponse(reason=text, llm_enabled=is_llm_enabled())


@router.post("/explain/batch", response_model=ExplainBatchResponse)
def explain_batch(body: ExplainBatchRequest) -> ExplainBatchResponse:
    out: list[dict[str, Any]] = []
    for item in body.items:
        text = generate_recommendation_reason(
            body.user_signals,
            item.place,
            max_chars=body.max_chars,
        )
        out.append({
            "place_id": item.place.get("id") or item.place.get("place_id") or "",
            "reason":   text,
        })
    return ExplainBatchResponse(reasons=out, llm_enabled=is_llm_enabled())


@router.post("/explain/reviews", response_model=SummarizeReviewsResponse)
def explain_reviews(body: SummarizeReviewsRequest) -> SummarizeReviewsResponse:
    summary = summarize_reviews(body.reviews, max_chars=body.max_chars)
    return SummarizeReviewsResponse(summary=summary, llm_enabled=is_llm_enabled())
