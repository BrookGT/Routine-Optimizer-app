"""
routers/feedback.py — POST /feedback, /feedback/batch, GET /preferences/{user_id}.

Receives real-time interaction events from the backend so the bandit
can learn between full /train runs.  Also exposes the user's preference
vector so the mobile app and recommendation engine can read it.

Request body (single):
  {
    "user_id":     "uid",
    "place_id":    "place_42",     # optional (logged only)
    "place_type":  "coffee",
    "action_type": "save",         # any canonical INTERACTION_TYPE
    "hour":        9,              # optional local hour (0-23)
    "day_type":    "weekday"       # optional "weekday" | "weekend"
  }

Request body (batch):
  { "items": [ <single>, <single>, ... ] }

GET /preferences/{user_id}:
  Returns { "user_id": str, "preferences": { category: float, ... },
            "top_categories": [[cat, score], ...] }
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from learning.realtime import (
    apply_feedback,
    apply_feedback_batch,
    get_preference_vector,
    get_top_categories,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Learning"])


class FeedbackIn(BaseModel):
    user_id:     str
    place_id:    Optional[str] = None
    place_type:  str
    action_type: str
    hour:        Optional[int] = None
    day_type:    Optional[str] = "weekday"
    metadata:    Optional[dict[str, Any]] = Field(default_factory=dict)


class FeedbackBatchIn(BaseModel):
    items: list[FeedbackIn] = []


@router.post("/feedback", summary="Real-time bandit + preference vector update (single)")
def feedback(body: FeedbackIn) -> dict[str, Any]:
    return apply_feedback(body.model_dump())


@router.post("/feedback/batch", summary="Real-time bandit + preference vector update (batch)")
def feedback_batch(body: FeedbackBatchIn) -> dict[str, Any]:
    return apply_feedback_batch([item.model_dump() for item in body.items])


@router.get("/preferences/{user_id}", summary="Get user preference vector and top categories")
def get_preferences(user_id: str) -> dict[str, Any]:
    """
    Returns the current in-memory preference vector for a user.
    Includes base category affinities (e.g. coffee: 0.82) and time-slotted
    sub-keys (e.g. coffee_morning: 0.75).

    Note: this is the live in-memory state.  If the service restarted recently
    and the user has not yet sent any feedback this session, the vector may be
    empty (cold-start defaults to 0.5 per category in the bandit, but the
    preference vector only grows from real interactions).
    """
    vec  = get_preference_vector(user_id)
    top  = get_top_categories(user_id, n=10)
    return {
        "user_id":       user_id,
        "preferences":   vec,
        "top_categories": [[cat, round(score, 4)] for cat, score in top],
    }
