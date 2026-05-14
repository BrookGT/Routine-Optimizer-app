"""
learning/realtime.py — Online updates to the bandit + auto-persist.

The Python AI service previously only learned during full /train
batches. This module lets a single interaction update the bandit
immediately:

    apply_feedback({
        "user_id": "abc",
        "place_id": "p_42",
        "place_type": "coffee",
        "action_type": "save",
    })

After every successful update we schedule an asynchronous flush of the
bandit state to disk (debounced, so a burst of interactions writes only
once every BANDIT_PERSIST_INTERVAL_SEC).

Sequence model state isn't updated incrementally (training the GRU on
single examples is unstable); instead, it's refreshed during the
periodic /train cycle.  However the *recent_types* list used at
inference time is always derived from the live interaction stream, so
sequence predictions still reflect new behaviour immediately.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

from models.bandit import get_bandit
from store.model_store import save_all, get_meta

logger = logging.getLogger(__name__)

# How often to persist bandit state to disk (debounced).
_PERSIST_INTERVAL_SEC = float(os.getenv("BANDIT_PERSIST_INTERVAL_SEC", "30"))

_state_lock     = threading.Lock()
_dirty          = False
_last_persisted = 0.0
_persist_timer: threading.Timer | None = None


def _schedule_persist() -> None:
    """Debounced background save — runs once per _PERSIST_INTERVAL_SEC."""
    global _persist_timer

    def _flush() -> None:
        global _dirty, _last_persisted, _persist_timer
        with _state_lock:
            if not _dirty:
                _persist_timer = None
                return
            _dirty = False
            _last_persisted = time.time()
            _persist_timer = None
        try:
            meta = get_meta()
            save_all(
                data_size=meta.get("dataSize", 0),
                seq_metrics=None,
                emb_cache_size=meta.get("performanceMetrics", {}).get("embedding_cache_size"),
            )
            logger.info("[learning] bandit state flushed to disk (real-time update)")
        except Exception as exc:
            logger.warning("[learning] bandit persist failed: %s", exc)

    with _state_lock:
        if _persist_timer is None:
            _persist_timer = threading.Timer(_PERSIST_INTERVAL_SEC, _flush)
            _persist_timer.daemon = True
            _persist_timer.start()


def _normalize_action(action: str) -> str:
    """Normalize aliases to bandit-recognized action types."""
    a = (action or "").strip().lower()
    aliases = {
        "like":     "save",
        "favourite": "save",
        "favorite": "save",
        "tap":      "click",
        "open":     "click",
        "skip":     "dismiss",
        "ignore":   "dismiss",
        "hide":     "dismiss",
    }
    return aliases.get(a, a)


def apply_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Apply a single interaction to the bandit.

    Required keys:
      user_id     - string
      place_type  - string (e.g. 'gym', 'coffee')
      action_type - one of {'view','click','save','dismiss'} or aliases

    Optional keys:
      place_id, score, timestamp — accepted but unused for bandit update.

    Returns:
      {
        "updated": True/False,
        "user_id": str,
        "place_type": str,
        "action_type": str,
        "alpha": float,
        "beta":  float,
        "bandit_score": float
      }
    """
    user_id    = str(payload.get("user_id") or payload.get("userId") or "")
    place_type = str(payload.get("place_type") or payload.get("placeType") or "")
    action     = _normalize_action(payload.get("action_type") or payload.get("actionType") or "")

    if not user_id or not place_type or not action:
        return {
            "updated": False,
            "reason":  "missing_required_fields",
            "user_id": user_id,
            "place_type": place_type,
            "action_type": action,
        }
    if action not in ("view", "click", "save", "dismiss"):
        return {
            "updated": False,
            "reason":  f"invalid_action_type:{action}",
            "user_id": user_id,
            "place_type": place_type,
            "action_type": action,
        }

    bandit = get_bandit()
    bandit.update(user_id, place_type, action)

    # Read back the updated arm for logging / response transparency
    arm = bandit._get_arm(user_id, place_type)  # noqa: SLF001 — internal but stable
    a, b = arm["alpha"], arm["beta"]
    score = a / (a + b)

    global _dirty
    with _state_lock:
        _dirty = True
    _schedule_persist()

    logger.info(
        "[learning] feedback applied uid=%s type=%s action=%s alpha=%.2f beta=%.2f score=%.3f",
        user_id, place_type, action, a, b, score,
    )

    return {
        "updated":      True,
        "user_id":      user_id,
        "place_type":   place_type,
        "action_type":  action,
        "alpha":        round(a, 3),
        "beta":         round(b, 3),
        "bandit_score": round(score, 4),
    }


def apply_feedback_batch(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Apply many feedback events; one persistence flush at the end."""
    applied = 0
    failed  = 0
    for item in items:
        result = apply_feedback(item)
        if result.get("updated"):
            applied += 1
        else:
            failed += 1
    return {"applied": applied, "failed": failed}
