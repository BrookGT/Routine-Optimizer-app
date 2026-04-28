"""
routers/predict.py — POST /predict

Receives a list of candidate places + user context from the backend and
returns an aiScore per candidate computed from the three models:

  aiScore = (0.4 × banditScore) + (0.3 × sequenceScore) + (0.3 × embeddingScore)

Request body (CandidateRequest):
  {
    "user_id": "abc123",
    "candidates": [
      {
        "place_id": "place_1",
        "place_type": "gym",
        "place_name": "Downtown Gym",
        "place_description": "A full-service gym",
        "rating": 4.2,
        "raw_score": 35.5
      }
    ],
    "context": {
      "time_of_day": "morning",
      "session_intent": "fitness",
      "recent_types": ["gym", "coffee", "gym"],
      "type_affinity": {"gym": 0.8, "coffee": 0.5}
    }
  }

Response:
  {
    "ranked_places": [
      {
        "place_id": "place_1",
        "ai_score": 0.72,
        "bandit_score": 0.65,
        "sequence_score": 0.80,
        "embedding_score": 0.70
      }
    ],
    "model_version": "v2",
    "inference_ms": 45
  }

Graceful degradation:
  Any per-candidate failure silently returns ai_score=0.5 (neutral) so the
  backend can still compute finalScore = 0.7×rawScore + 0.3×aiScore
  without crashing.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

import config
from models.bandit    import get_bandit
from models.embeddings import embedding_score
from models.sequence  import get_sequence_model
from store.model_store import get_meta

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Request / Response schemas ──────────────────────────────────────────────

class CandidateIn(BaseModel):
    place_id:          str
    place_type:        str
    place_name:        Optional[str] = ""
    place_description: Optional[str] = ""
    rating:            Optional[float] = 3.0
    raw_score:         Optional[float] = 0.0


class ContextIn(BaseModel):
    time_of_day:    Optional[str]        = "morning"
    session_intent: Optional[str]        = "explore"
    recent_types:   Optional[list[str]]  = Field(default_factory=list)
    type_affinity:  Optional[dict[str, float]] = Field(default_factory=dict)


class PredictRequest(BaseModel):
    user_id:    str
    candidates: list[CandidateIn]
    context:    Optional[ContextIn] = None


class RankedPlace(BaseModel):
    place_id:        str
    ai_score:        float
    bandit_score:    float
    sequence_score:  float
    embedding_score: float


class PredictResponse(BaseModel):
    ranked_places:  list[RankedPlace]
    model_version:  str
    inference_ms:   int
    predicted_type: Optional[str]  = None   # top type from sequence model for this session
    confidence:     float          = 0.0    # probability mass on predicted_type


# ─── Scoring helpers ─────────────────────────────────────────────────────────

def _score_candidate(
    user_id:       str,
    candidate:     CandidateIn,
    context:       ContextIn,
    seq_dist:      dict[str, float],
    interaction_types: list[str],
) -> RankedPlace:
    """Computes three model scores and combines them for one candidate."""
    try:
        # 1. Bandit score
        bandit = get_bandit()
        b_score = bandit.bandit_score(user_id, candidate.place_type)

        # 2. Sequence score (look up pre-computed distribution)
        s_score = seq_dist.get(candidate.place_type, 1.0 / len(config.PLACE_TYPES))

        # 3. Embedding score
        type_aff = (context.type_affinity or {}).get(candidate.place_type, 0.5)
        e_score  = embedding_score(
            user_id,
            candidate.place_id,
            candidate.place_name or "",
            candidate.place_description or "",
            interaction_types,
        )
        # If embedding returns neutral (no key or cache miss), fall back to
        # type affinity as a semantic proxy
        if e_score == 0.5 and type_aff != 0.5:
            e_score = type_aff

        # 4. Weighted combination
        ai = (
            config.BANDIT_WEIGHT   * b_score +
            config.SEQUENCE_WEIGHT * s_score +
            config.EMBEDDING_WEIGHT * e_score
        )
        ai = round(max(0.0, min(1.0, ai)), 4)

        return RankedPlace(
            place_id=candidate.place_id,
            ai_score=ai,
            bandit_score=round(b_score, 4),
            sequence_score=round(s_score, 4),
            embedding_score=round(e_score, 4),
        )

    except Exception as exc:
        logger.warning("[predict] candidate %s failed: %s", candidate.place_id, exc)
        return RankedPlace(
            place_id=candidate.place_id,
            ai_score=0.5,
            bandit_score=0.5,
            sequence_score=0.5,
            embedding_score=0.5,
        )


# ─── Route ───────────────────────────────────────────────────────────────────

@router.post("/predict", response_model=PredictResponse, tags=["Inference"])
def predict(req: PredictRequest) -> PredictResponse:
    """
    Scores each candidate place for the given user and returns ranked aiScores.

    The backend should merge:
      finalScore = 0.7 × rawScore + 0.3 × aiScore
    """
    t0 = time.perf_counter()

    ctx  = req.context or ContextIn()
    meta = get_meta()

    # Pre-compute sequence distribution once for this request
    seq_model   = get_sequence_model()
    recent_types = ctx.recent_types or []
    seq_dist    = seq_model.predict_distribution(recent_types)

    # Derive interaction types list for user embedding
    interaction_types = recent_types

    results = [
        _score_candidate(
            req.user_id, cand, ctx, seq_dist, interaction_types
        )
        for cand in req.candidates
    ]

    # Sort descending by ai_score
    results.sort(key=lambda r: r.ai_score, reverse=True)

    # Top predicted type from sequence model (highest-probability next activity for this user)
    predicted_type: Optional[str] = None
    confidence: float = 0.0
    if seq_dist:
        predicted_type = max(seq_dist, key=seq_dist.__getitem__)
        confidence     = round(seq_dist[predicted_type], 4)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    if elapsed_ms > 800:
        logger.warning("[predict] slow inference: %d ms for %d candidates", elapsed_ms, len(results))

    return PredictResponse(
        ranked_places=results,
        model_version=meta.get("version", "v0"),
        inference_ms=elapsed_ms,
        predicted_type=predicted_type,
        confidence=confidence,
    )
