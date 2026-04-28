"""
routers/reset.py — POST /reset

Hard-resets all AI model artefacts:
  - Deletes bandit_state.json, sequence_model.json, model_meta.json,
    training_dataset.json, place_embeddings.json, user_embeddings.json
  - Replaces in-memory singletons with fresh (untrained) instances
  - Resets the embedding in-memory caches

Safe to call at any time. The next /predict will return neutral scores (0.5)
until /train is called and enough interactions have accumulated.
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter
from pydantic import BaseModel

import config
from models.bandit    import BanditModel, set_bandit
from models.sequence  import SequenceModel, set_sequence_model
from models.embeddings import clear_embedding_caches
from store.model_store import _META_PATH, _BANDIT_PATH, _SEQ_PATH

logger = logging.getLogger(__name__)
router = APIRouter()

# Extra artefact paths that the pipeline writes during training
_TRAINING_DATASET_PATH = os.path.join(config.DATA_DIR, "training_dataset.json")
_PLACE_EMBEDDINGS_PATH = os.path.join(config.DATA_DIR, "place_embeddings.json")
_USER_EMBEDDINGS_PATH  = os.path.join(config.DATA_DIR, "user_embeddings.json")

_ALL_ARTEFACT_PATHS = [
    _BANDIT_PATH,
    _SEQ_PATH,
    _META_PATH,
    _TRAINING_DATASET_PATH,
    _PLACE_EMBEDDINGS_PATH,
    _USER_EMBEDDINGS_PATH,
]


class ResetResponse(BaseModel):
    success:        bool
    message:        str
    deleted_files:  list[str]


@router.post("/reset", response_model=ResetResponse, tags=["Admin"])
def reset_models() -> ResetResponse:
    """
    Wipe all saved model artefacts and reset in-memory state to factory defaults.

    After this call:
      - /model/status will show version v0, lastTrainedAt=null
      - /predict will return ai_score=0.5 (neutral) for every candidate
      - /train must be called to restart learning from Firestore interactions
    """
    deleted: list[str] = []

    # 1. Delete artefact files
    for path in _ALL_ARTEFACT_PATHS:
        if os.path.exists(path):
            try:
                os.remove(path)
                deleted.append(os.path.basename(path))
                logger.info("[reset] deleted %s", path)
            except Exception as exc:
                logger.warning("[reset] could not delete %s: %s", path, exc)

    # 2. Reset in-memory singletons to untrained defaults
    set_bandit(BanditModel())
    set_sequence_model(SequenceModel())

    # 3. Clear embedding caches
    try:
        clear_embedding_caches()
        logger.info("[reset] embedding caches cleared")
    except Exception as exc:
        logger.warning("[reset] embedding cache clear failed: %s", exc)

    logger.info("[reset] AI model reset complete. Deleted files: %s", deleted)

    return ResetResponse(
        success=True,
        message="AI model artefacts wiped. System is in cold-start state. Call /train to rebuild.",
        deleted_files=deleted,
    )
