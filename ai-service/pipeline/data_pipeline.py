"""
pipeline/data_pipeline.py — Firestore data extraction and training dataset builder.

Connects to Firestore using the Firebase Admin SDK and extracts:
  - user profiles (typeAffinity, embedding, interests)
  - interactions (action, placeId, userId, timestamp)
  - places (type, name, description, rating)
  - sessions (recent action queue)

Builds rows conforming to the training schema:
  {
    user_id, place_id, place_type, time_of_day,
    action_type, interaction_score, recency,
    session_intent, type_affinity, embedding_score
  }

Saves the result to data/training_dataset.json.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

import config

logger = logging.getLogger(__name__)

# ─── ACTION_SCORES (mirrors interaction.service.js) ───────────────────────────

ACTION_SCORES: dict[str, int] = {
    "view":    1,
    "click":   2,
    "save":    3,
    "dismiss": -1,
}

# ─── Firebase initialisation (idempotent) ─────────────────────────────────────

_firebase_app: Optional[firebase_admin.App] = None


def _get_firestore_client():
    global _firebase_app
    if _firebase_app is not None:
        return firestore.client()

    if not config.FIREBASE_PROJECT_ID:
        raise RuntimeError(
            "FIREBASE_PROJECT_ID is not set. "
            "Configure Firebase credentials in the .env file."
        )

    cred = credentials.Certificate({
        "type":                        "service_account",
        "project_id":                  config.FIREBASE_PROJECT_ID,
        "client_email":                config.FIREBASE_CLIENT_EMAIL,
        "private_key":                 config.FIREBASE_PRIVATE_KEY,
        "token_uri":                   "https://oauth2.googleapis.com/token",
        "auth_uri":                    "https://accounts.google.com/o/oauth2/auth",
        "client_x509_cert_url":        "",
    })

    # Must use the default app — firestore.client() calls get_app() with no name.
    # A named app (name="...") alone leaves no default and raises ValueError.
    try:
        _firebase_app = firebase_admin.get_app()
    except ValueError:
        _firebase_app = firebase_admin.initialize_app(cred)

    return firestore.client()


# ─── Time helpers ─────────────────────────────────────────────────────────────

def _hour_to_time_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 22:
        return "evening"
    return "night"


def _recency_weight(created_at_iso: str, now: datetime) -> float:
    """Returns 1.0 for today, 0.7 for 1–7 days, 0.4 for older."""
    try:
        ts = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
        age_h = (now - ts).total_seconds() / 3600
        if age_h < 24:
            return 1.0
        if age_h < 168:
            return 0.7
        return 0.4
    except Exception:
        return 0.5


# ─── Session intent approximation ─────────────────────────────────────────────

_FITNESS_TYPES = {"gym", "yoga"}
_SOCIAL_TYPES  = {"social"}
_RELAX_TYPES   = {"coffee", "cafe"}


def _infer_session_intent(prior_types: list[str]) -> str:
    window = prior_types[:10]
    if not window:
        return "explore"
    total = len(window)
    thr = 0.35 * total
    fitness = sum(1 for t in window if t in _FITNESS_TYPES)
    social  = sum(1 for t in window if t in _SOCIAL_TYPES)
    relax   = sum(1 for t in window if t in _RELAX_TYPES)
    if fitness >= thr:
        return "fitness"
    if social >= thr:
        return "social"
    if relax >= thr:
        return "relax"
    return "explore"


# ─── Public API ───────────────────────────────────────────────────────────────

def fetch_raw_data(limit: int = 10_000) -> dict:
    """
    Fetches interactions, users and places from Firestore.

    Returns a dict with keys: interactions, users (dict), places (dict).
    Raises RuntimeError when Firestore credentials are missing.
    """
    db = _get_firestore_client()

    logger.info("[pipeline] fetching interactions …")
    ix_snap = (
        db.collection("interactions")
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .get()
    )
    interactions = [d.to_dict() for d in ix_snap]
    logger.info(f"[pipeline] {len(interactions)} interactions fetched")

    # Unique users referenced by those interactions
    user_ids = list({ix.get("userId") for ix in interactions if ix.get("userId")})
    users: dict = {}
    BATCH = 500  # Firestore in_array limit
    for i in range(0, len(user_ids), BATCH):
        batch_ids = user_ids[i : i + BATCH]
        snaps = db.collection("users").where("__name__", "in", batch_ids).get()
        for s in snaps:
            users[s.id] = s.to_dict()
    logger.info(f"[pipeline] {len(users)} users fetched")

    # All places (static catalogue)
    places_snap = db.collection("places").get()
    places: dict = {d.id: d.to_dict() | {"id": d.id} for d in places_snap}
    logger.info(f"[pipeline] {len(places)} places fetched")

    return {"interactions": interactions, "users": users, "places": places}


def build_dataset(raw: dict) -> list[dict]:
    """
    Transforms raw Firestore data into a flat training dataset.

    Each row:
    {
        user_id, place_id, place_type, time_of_day,
        action_type, interaction_score, recency,
        session_intent, type_affinity, embedding_score,
        religion, weekend_preference, event_interests,
        has_daily_routine, working_hours_flex
    }
    """
    interactions: list[dict] = raw["interactions"]
    users: dict               = raw["users"]
    places: dict              = raw["places"]

    AFFINITY_CAP = 50
    now = datetime.now(tz=timezone.utc)

    # Group interactions per user (newest-first) for session windowing
    by_user: dict[str, list[dict]] = {}
    for ix in interactions:
        uid = ix.get("userId")
        if uid:
            by_user.setdefault(uid, []).append(ix)
    for uid in by_user:
        by_user[uid].sort(
            key=lambda x: x.get("createdAt", ""), reverse=True
        )

    dataset: list[dict] = []

    for ix in interactions:
        uid     = ix.get("userId")
        pid     = ix.get("placeId")
        action  = ix.get("actionType")

        if not uid or not pid or action not in ACTION_SCORES:
            continue

        user  = users.get(uid)
        place = places.get(pid)

        if not user or not place:
            continue

        place_type = place.get("type", "")
        if not place_type:
            continue

        # Time features
        created_at = ix.get("createdAt", "")
        try:
            ts  = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            tod = _hour_to_time_of_day(ts.hour)
        except Exception:
            tod = "morning"

        # Recency
        recency = _recency_weight(created_at, now)

        # Session intent from prior interactions
        user_ixs = by_user.get(uid, [])
        self_idx = next(
            (i for i, x in enumerate(user_ixs) if x.get("id") == ix.get("id")), -1
        )
        prior_types = [
            places[x["placeId"]].get("type", "")
            for x in (user_ixs[self_idx + 1 :] if self_idx >= 0 else user_ixs)
            if x.get("placeId") in places
        ]
        session_intent = _infer_session_intent(prior_types)

        # Type affinity (normalised)
        raw_aff     = (user.get("typeAffinity") or {}).get(place_type, 0)
        type_affinity = (raw_aff + AFFINITY_CAP) / (2 * AFFINITY_CAP)

        # Embedding score (cosine of user.embedding[place_type] as proxy)
        user_emb = user.get("embedding") or {}
        emb_val  = user_emb.get(place_type, 0)

        # Onboarding profile enrichment fields (new — default to empty/neutral when absent)
        religion            = user.get("religion", "") or ""
        weekend_preference  = user.get("weekendPreference", "") or ""
        event_interests     = user.get("eventInterests") or []
        daily_routine       = user.get("dailyRoutine") or {}
        working_hours_flex  = (user.get("workingHours") or {}).get("flexible", True)

        dataset.append({
            "user_id":              uid,
            "place_id":             pid,
            "place_type":           place_type,
            "time_of_day":          tod,
            "action_type":          action,
            "interaction_score":    ACTION_SCORES[action],
            "recency":              recency,
            "session_intent":       session_intent,
            "type_affinity":        float(type_affinity),
            "embedding_score":      float(emb_val),
            # Onboarding signals — used in future model versions for richer features
            "religion":             religion,
            "weekend_preference":   weekend_preference,
            "event_interests":      event_interests,
            "has_daily_routine":    bool(daily_routine),
            "working_hours_flex":   bool(working_hours_flex),
        })

    logger.info(f"[pipeline] dataset built: {len(dataset)} rows")
    return dataset


def save_dataset(dataset: list[dict]) -> str:
    """Persists the dataset to data/training_dataset.json. Returns the path."""
    os.makedirs(config.DATA_DIR, exist_ok=True)
    path = os.path.join(config.DATA_DIR, "training_dataset.json")
    with open(path, "w") as f:
        json.dump(dataset, f, indent=2)
    logger.info(f"[pipeline] saved {len(dataset)} rows → {path}")
    return path


def load_dataset() -> list[dict]:
    """Loads the dataset from disk. Returns [] if file does not exist."""
    path = os.path.join(config.DATA_DIR, "training_dataset.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)
