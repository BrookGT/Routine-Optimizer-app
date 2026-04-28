"""
routers/status.py — GET /model/status

Returns the current state of all AI model artefacts:
  modelVersion, lastTrainedAt, dataSize, performanceMetrics.

This endpoint is used by:
  - The backend health check to verify the AI service is trained
  - The admin dashboard to monitor model health
  - The retraining decision logic (compare dataSize with current interaction count)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel

import config

from models.bandit    import get_bandit
from models.embeddings import cache_size, get_embedding_limiter_snapshot
from models.sequence  import get_sequence_model
from store.model_store import get_meta

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schema ──────────────────────────────────────────────────────────────────

class PerformanceMetrics(BaseModel):
    bandit_arms:          int
    lstm_trained:         bool
    embedding_cache_size: dict
    bandit_users:         int
    sequence_final_loss:  float | None = None


class ModelStatusResponse(BaseModel):
    modelVersion:       str
    lastTrainedAt:      str | None
    dataSize:           int
    performanceMetrics: PerformanceMetrics
    openai_embedding: dict | None = None


# ─── Route ───────────────────────────────────────────────────────────────────

@router.get("/model/status", response_model=ModelStatusResponse, tags=["Model"])
def model_status() -> ModelStatusResponse:
    """
    Returns real-time model metadata combining persisted metadata with live
    in-memory state (e.g. current embedding cache size).
    """
    meta    = get_meta()
    bandit  = get_bandit()
    seq_m   = get_sequence_model()
    emb_sz  = cache_size()

    persisted_metrics = meta.get("performanceMetrics") or {}

    pm = PerformanceMetrics(
        bandit_arms=persisted_metrics.get("bandit_arms", 8),
        lstm_trained=seq_m.is_trained(),
        embedding_cache_size=emb_sz,
        bandit_users=len(bandit.state_dict()),
        sequence_final_loss=persisted_metrics.get("sequence_final_loss"),
    )

    oai = None
    if config.OPENAI_API_KEY:
        oai = get_embedding_limiter_snapshot()
        oai["embed_max_chars"] = config.OPENAI_EMBED_MAX_CHARS
        oai["batch_size"]      = config.OPENAI_EMBED_BATCH_SIZE

    return ModelStatusResponse(
        modelVersion=meta.get("version", "v0"),
        lastTrainedAt=meta.get("lastTrainedAt"),
        dataSize=meta.get("dataSize", 0),
        performanceMetrics=pm,
        openai_embedding=oai,
    )
