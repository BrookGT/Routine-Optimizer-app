"""
routers/train.py — POST /train

Triggers a full training cycle:
  1. Extract interactions / users / places from Firestore
  2. Build training dataset (data_pipeline)
  3. Update Contextual Bandit arms (bandit.bulk_update)
  4. Train / re-train GRU sequence model
  5. Pre-compute and cache OpenAI embeddings
  6. Persist all artefacts + increment model version

Can be triggered:
  a) By POST /train from any authorized client
  b) Automatically by the interaction service when interactionCount >= threshold
     (the interaction.service.js already calls maybeRetrain — this mirrors
     that logic in Python so the AI model stays in sync).

Request (TrainRequest):
  { "force": true }  — optional, retrain even if threshold not met

Response:
  {
    "status": "trained" | "skipped" | "error",
    "model_version": "v3",
    "samples": 150,
    "elapsed_ms": 3200,
    "details": { … }
  }
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config
from models.bandit    import get_bandit
from models.embeddings import build_embeddings_for_dataset, cache_size
from models.sequence  import get_sequence_model
from pipeline.data_pipeline import (
    build_dataset,
    fetch_raw_data,
    save_dataset,
)
from store.model_store import get_meta, save_all

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class TrainRequest(BaseModel):
    force: bool = False


class TrainResponse(BaseModel):
    status:        str
    model_version: str
    samples:       int
    elapsed_ms:    int
    details:       dict


# ─── Route ───────────────────────────────────────────────────────────────────

@router.post("/train", response_model=TrainResponse, tags=["Training"])
def train(req: TrainRequest) -> TrainResponse:
    """
    Runs the full training pipeline and returns updated model metadata.
    """
    t0 = time.perf_counter()

    # ── Check threshold (unless forced) ──────────────────────────────────────
    meta = get_meta()
    last_data_size = meta.get("dataSize", 0)

    try:
        raw = fetch_raw_data(limit=10_000)
    except RuntimeError as exc:
        logger.error("[train] Firestore connection failed: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))

    interactions = raw["interactions"]
    current_size = len(interactions)

    if not req.force and current_size - last_data_size < config.RETRAIN_THRESHOLD:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return TrainResponse(
            status="skipped",
            model_version=meta.get("version", "v0"),
            samples=current_size,
            elapsed_ms=elapsed_ms,
            details={
                "reason": "threshold_not_met",
                "current": current_size,
                "last_trained_at": current_size,
                "threshold": config.RETRAIN_THRESHOLD,
            },
        )

    # ── Build dataset ────────────────────────────────────────────────────────
    dataset = build_dataset(raw)
    save_dataset(dataset)

    if not dataset:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return TrainResponse(
            status="skipped",
            model_version=meta.get("version", "v0"),
            samples=0,
            elapsed_ms=elapsed_ms,
            details={"reason": "empty_dataset"},
        )

    places_by_id = raw["places"]

    # ── Bandit update ─────────────────────────────────────────────────────────
    bandit = get_bandit()
    bandit_updates = bandit.bulk_update(interactions, places_by_id)
    logger.info("[train] bandit updated: %d arm updates", bandit_updates)

    # ── Sequence model training ───────────────────────────────────────────────
    seq_model  = get_sequence_model()
    seq_result = seq_model.train_on_dataset(dataset)
    logger.info("[train] sequence model: %s", seq_result)

    # ── Embeddings pre-computation ────────────────────────────────────────────
    build_embeddings_for_dataset(dataset, places_by_id)
    emb_size = cache_size()

    # ── Persist + version ─────────────────────────────────────────────────────
    new_meta = save_all(
        data_size=len(dataset),
        seq_metrics=seq_result,
        emb_cache_size=emb_size,
    )

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    logger.info(
        "[train] done — version=%s  samples=%d  elapsed=%dms",
        new_meta["version"], len(dataset), elapsed_ms,
    )

    return TrainResponse(
        status="trained",
        model_version=new_meta["version"],
        samples=len(dataset),
        elapsed_ms=elapsed_ms,
        details={
            "bandit_updates":     bandit_updates,
            "sequence":           seq_result,
            "embedding_cache":    emb_size,
            "raw_interactions":   current_size,
        },
    )
