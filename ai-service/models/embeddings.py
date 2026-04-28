"""
models/embeddings.py — OpenAI embedding-based semantic similarity.

Generates dense embeddings for places and users using OpenAI's
text-embedding-3-small model, then computes cosine similarity to produce
an embeddingScore in [0, 1].

Embedding cache:
  Place embeddings keyed by place_id are cached in data/place_embeddings.json.
  User embeddings keyed by user_id are cached in data/user_embeddings.json.

Token & rate protection (production-style):
  - Input truncation (OPENAI_EMBED_MAX_CHARS) to cap billed tokens.
  - Sliding-window RPM limit + optional min spacing + optional soft TPM ceiling
    via models/embedding_limiter.py.
  - Training (/train): batched embeddings.create(input=[...]) to minimize
    HTTP calls vs one request per row.
  - Inference (/predict): try_consume — if blocked, skip API and behave as
    cache miss / neutral similarity.

Cold-start / no-key graceful fallback:
  When OPENAI_API_KEY is empty or the API is unavailable, embeddingScore = 0.5
  so the other two model components continue to work.
"""

from __future__ import annotations

import json
import logging
import math
import os
from typing import Optional

import config

from models.embedding_limiter import OpenAIEmbeddingLimiter

logger = logging.getLogger(__name__)

# ─── File paths ───────────────────────────────────────────────────────────────

_PLACE_EMB_PATH = os.path.join(config.DATA_DIR, "place_embeddings.json")
_USER_EMB_PATH  = os.path.join(config.DATA_DIR, "user_embeddings.json")

# ─── In-memory caches ────────────────────────────────────────────────────────

_place_cache: dict[str, list[float]] = {}
_user_cache:  dict[str, list[float]] = {}
_cache_loaded = False

# ─── OpenAI client + limiter (process-local singletons) ──────────────────────

_openai_client = None
_limiter: Optional[OpenAIEmbeddingLimiter] = None


def _get_limiter() -> OpenAIEmbeddingLimiter:
    global _limiter
    if _limiter is None:
        _limiter = OpenAIEmbeddingLimiter(
            max_rpm=config.OPENAI_RPM_LIMIT,
            min_interval_sec=config.OPENAI_MIN_EMBED_INTERVAL_SEC,
            tpm_soft_limit=config.OPENAI_TPM_SOFT_LIMIT,
        )
    return _limiter


def get_embedding_limiter_snapshot() -> dict:
    """For GET /model/status — rate-limit + usage counters."""
    return _get_limiter().snapshot()


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _openai_client


def _truncate(text: str) -> str:
    m = config.OPENAI_EMBED_MAX_CHARS
    if m <= 0 or len(text) <= m:
        return text
    return text[:m]


def _est_tokens(text: str) -> int:
    """Rough input-token estimate for billing / soft TPM (chars ÷ 4)."""
    return max(1, len(text) // 4)


def _load_caches() -> None:
    global _place_cache, _user_cache, _cache_loaded
    if os.path.exists(_PLACE_EMB_PATH):
        with open(_PLACE_EMB_PATH) as f:
            _place_cache = json.load(f)
    if os.path.exists(_USER_EMB_PATH):
        with open(_USER_EMB_PATH) as f:
            _user_cache = json.load(f)
    _cache_loaded = True
    logger.info(
        "[embeddings] loaded caches — places=%d  users=%d",
        len(_place_cache), len(_user_cache),
    )


def _save_caches() -> None:
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(_PLACE_EMB_PATH, "w") as f:
        json.dump(_place_cache, f)
    with open(_USER_EMB_PATH, "w") as f:
        json.dump(_user_cache, f)
    logger.info(
        "[embeddings] caches saved — places=%d  users=%d",
        len(_place_cache), len(_user_cache),
    )


def ensure_loaded() -> None:
    if not _cache_loaded:
        _load_caches()


# ─── Single-text API (inference — non-blocking rate gate) ───────────────────

def _get_openai_embedding_single(text: str, *, for_training: bool) -> Optional[list[float]]:
    if not config.OPENAI_API_KEY:
        return None

    text = _truncate(text)
    if not text.strip():
        return None

    est = _est_tokens(text)
    lim = _get_limiter()
    if for_training:
        lim.wait_and_consume(est)
        ok = True
    else:
        ok = lim.try_consume(est)
    if not ok:
        logger.debug("[embeddings] rate/tpm/spacing blocked — skip OpenAI (inference)")
        return None

    try:
        client = _get_openai_client()
        resp = client.embeddings.create(
            input=text,
            model=config.OPENAI_EMBEDDING_MODEL,
        )
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("[embeddings] OpenAI call failed: %s", exc)
        return None


# ─── Batch API (training — one HTTP request, one RPM slot, TPM = sum(est)) ────

def _embed_texts_batch(
    texts: list[str],
    *,
    for_training: bool,
) -> list[Optional[list[float]]]:
    """Embeds aligned list of texts; returns same length as input."""
    out: list[Optional[list[float]]] = [None] * len(texts)
    if not texts or not config.OPENAI_API_KEY:
        return out

    truncated = [_truncate(t) for t in texts]
    chunk_sz = max(1, config.OPENAI_EMBED_BATCH_SIZE)

    idx = 0
    while idx < len(truncated):
        batch = truncated[idx : idx + chunk_sz]
        est_batch = sum(_est_tokens(x) for x in batch)

        lim = _get_limiter()
        if for_training:
            lim.wait_and_consume(est_batch)
        else:
            if not lim.try_consume(est_batch):
                logger.debug("[embeddings] batch blocked by limiter")
                idx += chunk_sz
                continue

        try:
            client = _get_openai_client()
            resp = client.embeddings.create(
                input=batch,
                model=config.OPENAI_EMBEDDING_MODEL,
            )
            for j, emb in enumerate(resp.data):
                out[idx + j] = emb.embedding
        except Exception as exc:
            logger.warning("[embeddings] batch OpenAI failed: %s", exc)

        idx += chunk_sz

    return out


# ─── Cosine similarity ────────────────────────────────────────────────────────

def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.5
    dot  = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.5
    return (dot / (norm_a * norm_b) + 1) / 2


# ─── Public API ───────────────────────────────────────────────────────────────

def get_place_embedding(
    place_id: str, name: str = "", description: str = ""
) -> Optional[list[float]]:
    ensure_loaded()
    if place_id in _place_cache:
        return _place_cache[place_id]

    text = f"{name}: {description}".strip() if description else name
    if not text:
        return None

    emb = _get_openai_embedding_single(text, for_training=False)
    if emb:
        _place_cache[place_id] = emb
    return emb


def get_user_embedding(
    user_id: str, interaction_types: list[str]
) -> Optional[list[float]]:
    ensure_loaded()
    if user_id in _user_cache:
        return _user_cache[user_id]

    if not interaction_types:
        return None

    type_str = ", ".join(interaction_types[:20])
    text     = f"User interested in: {type_str}"
    emb      = _get_openai_embedding_single(text, for_training=False)
    if emb:
        _user_cache[user_id] = emb
    return emb


def embedding_score(
    user_id:           str,
    place_id:          str,
    name:              str = "",
    description:       str = "",
    interaction_types: list[str] = (),
) -> float:
    p_emb = get_place_embedding(place_id, name, description)
    u_emb = get_user_embedding(user_id, list(interaction_types))

    if p_emb is None or u_emb is None:
        return 0.5

    return cosine_similarity(u_emb, p_emb)


def build_embeddings_for_dataset(
    dataset: list[dict],
    places_by_id: dict[str, dict],
) -> None:
    """
    Pre-computes and caches embeddings using batched API calls where possible.

    Saves disk I/O tokens by truncating inputs and minimizing HTTP requests.
    """
    if not config.OPENAI_API_KEY:
        logger.info("[embeddings] no API key — skipping pre-computation")
        return

    ensure_loaded()
    BS = max(1, config.OPENAI_EMBED_BATCH_SIZE)

    # ── Places: dedupe identical truncated strings (saves tokens vs N separate calls)
    pid_to_tr: dict[str, str] = {}
    for pid in {r["place_id"] for r in dataset}:
        if pid in _place_cache:
            continue
        place = places_by_id.get(pid, {})
        name  = place.get("name", "")
        desc  = place.get("description", "")
        raw   = f"{name}: {desc}".strip() if desc else name
        if not raw:
            continue
        pid_to_tr[pid] = _truncate(raw)

    unique_texts_in_order = list(dict.fromkeys(pid_to_tr.values()))

    idx = 0
    vec_by_text: dict[str, list[float]] = {}
    while idx < len(unique_texts_in_order):
        chunk = unique_texts_in_order[idx : idx + BS]
        vectors = _embed_texts_batch(chunk, for_training=True)
        for t, vec in zip(chunk, vectors):
            if vec is not None:
                vec_by_text[t] = vec
        idx += BS

    for pid, tr in pid_to_tr.items():
        vec = vec_by_text.get(tr)
        if vec:
            _place_cache[pid] = vec

    logger.info("[embeddings] embedded %d distinct place texts", len(vec_by_text))

    # ── Users: one text per user, batch ──────────────────────────────────────
    by_user: dict[str, list[str]] = {}
    for row in dataset:
        by_user.setdefault(row["user_id"], []).append(row["place_type"])

    user_strings: dict[str, str] = {}
    for uid in by_user:
        if uid in _user_cache:
            continue
        types = by_user[uid]
        if not types:
            continue
        type_str = ", ".join(types[:20])
        user_strings[uid] = _truncate(f"User interested in: {type_str}")

    uids = list(user_strings.keys())
    idx = 0
    while idx < len(uids):
        batch_uids = uids[idx : idx + BS]
        chunk_txt  = [user_strings[u] for u in batch_uids]
        vecs       = _embed_texts_batch(chunk_txt, for_training=True)
        for uid, vec in zip(batch_uids, vecs):
            if vec:
                _user_cache[uid] = vec
        idx += BS

    logger.info("[embeddings] user embedding pass — %d users", len(user_strings))

    _save_caches()
    logger.info("[embeddings] pre-computation done")


def cache_size() -> dict[str, int]:
    ensure_loaded()
    return {"places": len(_place_cache), "users": len(_user_cache)}


def clear_embedding_caches() -> None:
    """Wipe in-memory place and user embedding caches (used by POST /reset)."""
    global _place_cache, _user_cache
    _place_cache = {}
    _user_cache  = {}
