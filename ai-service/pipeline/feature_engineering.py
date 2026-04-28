"""
pipeline/feature_engineering.py — Transforms raw dataset rows into
numeric feature vectors suitable for ML models.

Feature vector layout (matches trainingDataBuilder.js FEATURE_NAMES):
  [0]  place_type_oh[0..7]   — one-hot over 8 place types (8 dims)
  [8]  time_of_day_oh[0..3]  — one-hot over 4 time bands  (4 dims)
  [12] intent_oh[0..3]       — one-hot over 4 intents      (4 dims)
  [16] interaction_score_n   — interaction score in [-1,3] → [0,1]
  [17] recency               — already in [0,1]
  [18] type_affinity         — already in [0,1]
  [19] embedding_score       — already in [0,1]

Total: 20 dimensions.

Label: engagement probability derived from interaction_score.
  save=1.0, click=0.67, view=0.33, dismiss=0.0
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np

import config

# ─── Encoding tables ──────────────────────────────────────────────────────────

_PLACE_TYPES   = config.PLACE_TYPES                  # 8 values
_TIME_BANDS    = ["morning", "afternoon", "evening", "night"]
_INTENTS       = ["explore", "fitness", "social", "relax"]

FEATURE_DIM = len(_PLACE_TYPES) + len(_TIME_BANDS) + len(_INTENTS) + 4
# = 8 + 4 + 4 + 4 = 20

# ─── Label mapping ────────────────────────────────────────────────────────────

_LABEL_MAP: dict[str, float] = {
    "save":    1.0,
    "click":   0.67,
    "view":    0.33,
    "dismiss": 0.0,
}


def _one_hot(value: str, vocab: list[str]) -> list[float]:
    return [1.0 if value == v else 0.0 for v in vocab]


def row_to_vector(row: dict) -> np.ndarray:
    """
    Converts a training dataset row (from data_pipeline.build_dataset) into
    a float32 numpy vector of length FEATURE_DIM.
    """
    vec: list[float] = []
    vec += _one_hot(row.get("place_type", ""), _PLACE_TYPES)
    vec += _one_hot(row.get("time_of_day", ""), _TIME_BANDS)
    vec += _one_hot(row.get("session_intent", ""), _INTENTS)

    # Normalise interaction_score from [-1, 3] → [0, 1]
    raw_score = float(row.get("interaction_score", 0))
    vec.append((raw_score + 1) / 4.0)

    vec.append(float(row.get("recency", 0.5)))
    vec.append(float(row.get("type_affinity", 0.5)))
    vec.append(float(row.get("embedding_score", 0.0)))

    return np.array(vec, dtype=np.float32)


def row_to_label(row: dict) -> float:
    """Returns an engagement probability label in [0, 1]."""
    return _LABEL_MAP.get(row.get("action_type", ""), 0.33)


class FeatureSet(NamedTuple):
    X: np.ndarray  # shape (N, FEATURE_DIM)
    y: np.ndarray  # shape (N,)


def build_feature_matrix(dataset: list[dict]) -> FeatureSet:
    """Converts the full training dataset to (X, y) numpy arrays."""
    if not dataset:
        return FeatureSet(
            X=np.empty((0, FEATURE_DIM), dtype=np.float32),
            y=np.empty((0,),             dtype=np.float32),
        )
    X = np.stack([row_to_vector(r) for r in dataset])
    y = np.array([row_to_label(r)  for r in dataset], dtype=np.float32)
    return FeatureSet(X=X, y=y)


# ─── Inference-time helper ────────────────────────────────────────────────────

def candidate_to_context_vector(
    place_type:     str,
    time_of_day:    str,
    session_intent: str,
    type_affinity:  float = 0.5,
    embedding_score: float = 0.5,
) -> np.ndarray:
    """
    Builds a feature vector for a single candidate at inference time.
    interaction_score and recency are set to neutral (0.5) since they
    represent the OUTCOME we are trying to predict.
    """
    vec: list[float] = []
    vec += _one_hot(place_type,     _PLACE_TYPES)
    vec += _one_hot(time_of_day,    _TIME_BANDS)
    vec += _one_hot(session_intent, _INTENTS)
    vec.append(0.5)          # interaction_score_n — neutral
    vec.append(0.5)          # recency            — neutral
    vec.append(type_affinity)
    vec.append(embedding_score)
    return np.array(vec, dtype=np.float32)
