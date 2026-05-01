"""
main.py — Wuloye AI Service (FastAPI)

Full AI service providing:
  POST /predict       — contextual bandit + GRU sequence + OpenAI embeddings
  POST /train         — full training pipeline (Firestore → models → persist)
  GET  /model/status  — model metadata and health
  GET  /api/health    — liveness probe (Docker / load-balancer)

Architecture:
  - Contextual Bandit (Thompson Sampling) for real-time arm selection
  - GRU sequence model for next-type prediction
  - OpenAI text-embedding-3-small for semantic similarity
  - aiScore = 0.4×bandit + 0.3×sequence + 0.3×embedding

All models are loaded from disk on startup and degrade gracefully when
artefacts are absent (cold start → neutral scores → rawScore dominates).
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from store.model_store import load_all
from routers import predict, train, status, reset, scrape, events

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Application factory ─────────────────────────────────────────────────────

app = FastAPI(
    title="Wuloye AI Service",
    description=(
        "Python microservice providing AI-powered recommendation scoring. "
        "Augments the rule-based Node.js backend without replacing it."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

_allowed = os.getenv("ALLOWED_ORIGINS", "*")
origins  = [o.strip() for o in _allowed.split(",")] if _allowed != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Startup: load model artefacts ────────────────────────────────────────────

@app.on_event("startup")
def startup_event() -> None:
    meta = load_all()
    logger.info(
        "[startup] model artefacts loaded — version=%s  dataSize=%d  lastTrained=%s",
        meta.get("version", "v0"),
        meta.get("dataSize", 0),
        meta.get("lastTrainedAt", "never"),
    )

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(predict.router)
app.include_router(train.router)
app.include_router(status.router)
app.include_router(reset.router)
app.include_router(scrape.router)
app.include_router(events.router)

# ─── Health check (liveness probe) ───────────────────────────────────────────

@app.get("/api/health", tags=["Health"])
def health_check() -> dict:
    """Liveness probe — returns status + current model version."""
    from store.model_store import get_meta
    meta = get_meta()
    return {
        "status":        "AI Service Running",
        "modelVersion":  meta.get("version", "v0"),
        "lastTrainedAt": meta.get("lastTrainedAt"),
    }
