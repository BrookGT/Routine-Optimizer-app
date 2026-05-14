"""
routers/feedback.py — POST /feedback (and /feedback/batch).

Receives real-time interaction events from the backend so the bandit
can learn between full /train runs.

Request body (single):
  {
    "user_id":     "uid",
    "place_id":    "place_42",          # optional (logged only)
    "place_type":  "coffee",
    "action_type": "save"                # view|click|save|dismiss (+ aliases)
  }

Request body (batch):
  { "items": [ <single>, <single>, ... ] }

Response:
  Single -> {"updated": true, "alpha":..., "beta":..., "bandit_score":...}
  Batch  -> {"applied": N, "failed": M}
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from learning.realtime import apply_feedback, apply_feedback_batch

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Learning"])


class FeedbackIn(BaseModel):
    user_id:     str
    place_id:    Optional[str] = None
    place_type:  str
    action_type: str
    metadata:    Optional[dict[str, Any]] = Field(default_factory=dict)


class FeedbackBatchIn(BaseModel):
    items: list[FeedbackIn] = []


@router.post("/feedback", summary="Real-time bandit update from a single interaction")
def feedback(body: FeedbackIn) -> dict[str, Any]:
    return apply_feedback(body.model_dump())


@router.post("/feedback/batch", summary="Real-time bandit update from many interactions")
def feedback_batch(body: FeedbackBatchIn) -> dict[str, Any]:
    return apply_feedback_batch([item.model_dump() for item in body.items])
