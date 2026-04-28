"""
config.py — Centralised environment configuration for the Wuloye AI Service.

All env vars are read once at import time.  Downstream modules import `config`
and access attributes — never os.getenv() directly.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ─── Firebase Admin SDK ───────────────────────────────────────────────────────

FIREBASE_PROJECT_ID    = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_CLIENT_EMAIL  = os.getenv("FIREBASE_CLIENT_EMAIL", "")
FIREBASE_PRIVATE_KEY   = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")

# ─── OpenAI ───────────────────────────────────────────────────────────────────

OPENAI_API_KEY         = os.getenv("OPENAI_API_KEY", "")
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

# ─── OpenAI Embeddings — token & rate protection (see models/embedding_limiter) ─
# Truncate input text before the API (saves billed tokens on long descriptions).
OPENAI_EMBED_MAX_CHARS = int(os.getenv("OPENAI_EMBED_MAX_CHARS", "8000"))
# Max embedding HTTP calls per rolling 60s window (per process). Batch many
# strings into one call = one slot. Tier-1 default is generous; lower for dev.
OPENAI_RPM_LIMIT = int(os.getenv("OPENAI_RPM_LIMIT", "90"))
# Minimum seconds between embedding API calls (0 = off). Small value reduces bursts.
OPENAI_MIN_EMBED_INTERVAL_SEC = float(os.getenv("OPENAI_MIN_EMBED_INTERVAL_SEC", "0.06"))
# Optional soft TPM ceiling (estimated from input chars÷4). 0 = disabled.
OPENAI_TPM_SOFT_LIMIT = int(os.getenv("OPENAI_TPM_SOFT_LIMIT", "0"))
# Max strings per single embeddings.create (OpenAI allows up to 2048 inputs).
OPENAI_EMBED_BATCH_SIZE = int(os.getenv("OPENAI_EMBED_BATCH_SIZE", "96"))

# ─── Model storage ────────────────────────────────────────────────────────────

DATA_DIR = os.getenv("DATA_DIR", "data")

# ─── Training ─────────────────────────────────────────────────────────────────

RETRAIN_THRESHOLD    = int(os.getenv("RETRAIN_THRESHOLD", "20"))
# Minimum interactions a user must have before we apply learned scores.
COLD_START_THRESHOLD = int(os.getenv("COLD_START_THRESHOLD", "3"))

# ─── AI score blend weights ───────────────────────────────────────────────────
# aiScore = BANDIT_WEIGHT * banditScore + SEQ_WEIGHT * seqScore + EMB_WEIGHT * embScore

BANDIT_WEIGHT   = float(os.getenv("BANDIT_WEIGHT",   "0.4"))
SEQUENCE_WEIGHT = float(os.getenv("SEQUENCE_WEIGHT", "0.3"))
EMBEDDING_WEIGHT = float(os.getenv("EMBEDDING_WEIGHT", "0.3"))

# ─── Place type catalogue ─────────────────────────────────────────────────────

PLACE_TYPES: list[str] = [
    "gym", "yoga", "coffee", "cafe", "restaurant", "social", "outdoor", "park",
]

PLACE_TYPE_INDEX: dict[str, int] = {t: i for i, t in enumerate(PLACE_TYPES)}

# ─── Inference timeout (seconds) — backend awaits this long before giving up ──

INFERENCE_TIMEOUT_S = float(os.getenv("INFERENCE_TIMEOUT_S", "0.8"))
