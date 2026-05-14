"""
routers/predict.py — POST /predict

Receives a list of candidate places + rich user context (including
onboarding signals: budget, religion, weekend preference, event interests)
and returns ranked aiScores plus pricing & reason enrichments per place.

  aiScore = (0.4 × banditScore) + (0.3 × sequenceScore) + (0.3 × embeddingScore)
            (+ small religion / weekend / budget-fit nudges)

Each ranked entry now includes:
  - bandit_score, sequence_score, embedding_score
  - ai_score                  — final blended [0,1]
  - price_level               — cheap | mid | expensive
  - estimated_cost            — {item: "low–high ETB"}
  - reason                    — one short personalisation sentence (LLM or template)

Graceful degradation:
  Per-candidate failures still emit ai_score=0.5 so the backend can rank
  with rawScore alone and never crashes.
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

from pricing import enrich_place
from pricing.dataset import budget_amount_to_tier, budget_label_normalize
from llm import generate_recommendation_reason, is_llm_enabled
from rag import score_keywords as rag_score

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
    # Optional richer fields that improve pricing accuracy
    address:           Optional[str] = ""
    user_ratings_total: Optional[int] = 0
    price_level:       Optional[Any] = None    # Google priceLevel (0–4 or string)
    tags:              Optional[list[str]] = Field(default_factory=list)
    reviews:           Optional[list[Any]] = Field(default_factory=list)
    image:             Optional[str] = ""


class ContextIn(BaseModel):
    time_of_day:        Optional[str]              = "morning"
    session_intent:     Optional[str]              = "explore"
    recent_types:       Optional[list[str]]        = Field(default_factory=list)
    type_affinity:      Optional[dict[str, float]] = Field(default_factory=dict)
    # Onboarding signals
    budget:             Optional[str]              = ""    # cheap|mid|expensive
    weekly_budget:      Optional[float]            = None  # numeric ETB
    budget_range:       Optional[str]              = ""    # legacy alias
    religion:           Optional[str]              = ""
    weekend_preference: Optional[str]              = ""
    event_interests:    Optional[list[str]]        = Field(default_factory=list)
    interests:          Optional[list[str]]        = Field(default_factory=list)
    # Display
    explain:            Optional[bool]             = False  # set true to fill `reason`


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
    # Context-aware pricing
    pricing_enabled: bool           = False
    pricing_reason: Optional[str]  = None
    # Present only when pricing_enabled (optional for JSON null)
    price_level:     Optional[str] = None
    price_confidence: float          = 0.0
    price_signals:   list[str] = Field(default_factory=list)
    estimated_cost:  dict[str, str] = Field(default_factory=dict)
    price_category:  str = "dining"
    # Optional explanation (only populated when context.explain == true)
    reason:          Optional[str] = None
    # Personalisation flags
    budget_fit:      bool = True


class PredictResponse(BaseModel):
    ranked_places:  list[RankedPlace]
    model_version:  str
    inference_ms:   int
    predicted_type: Optional[str]  = None
    confidence:     float          = 0.0
    llm_enabled:    bool           = False


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _resolve_budget_tier(ctx: ContextIn) -> str:
    """Normalise the various budget inputs to 'cheap|mid|expensive'."""
    if ctx.budget:
        return budget_label_normalize(ctx.budget)
    if ctx.weekly_budget is not None:
        return budget_amount_to_tier(ctx.weekly_budget)
    if ctx.budget_range:
        return budget_label_normalize(ctx.budget_range)
    return "mid"


def _budget_fit_score(user_tier: str, place_tier: str) -> tuple[float, bool]:
    """
    Returns (score_adjustment_in_[-0.05, +0.05], strictly_in_budget_flag).

    - Same tier            → +0.05 (perfect fit)
    - Adjacent tier         → 0
    - Cross-tier mismatch  → -0.05 (cheap user looking at expensive place, etc.)
    """
    if not place_tier or not user_tier:
        return 0.0, True
    order = {"cheap": 0, "mid": 1, "expensive": 2}
    a = order.get(user_tier, 1)
    b = order.get(place_tier, 1)
    diff = abs(a - b)
    if diff == 0:
        return 0.05, True
    if diff == 1:
        return 0.0, True  # one-tier away is acceptable
    return -0.05, False


# ─── Per-candidate scoring ────────────────────────────────────────────────────

def _score_candidate(
    user_id:           str,
    candidate:         CandidateIn,
    context:           ContextIn,
    seq_dist:          dict[str, float],
    interaction_types: list[str],
    user_budget_tier:  str,
) -> RankedPlace:
    """Computes three model scores, blends them, and enriches with pricing."""
    try:
        # ── 1. Bandit score ─────────────────────────────────────────────────
        bandit = get_bandit()
        b_score = bandit.bandit_score(user_id, candidate.place_type)

        # ── 2. Sequence score ───────────────────────────────────────────────
        s_score = seq_dist.get(candidate.place_type, 1.0 / len(config.PLACE_TYPES))

        # ── 3. Embedding score (with type-affinity fallback) ────────────────
        type_aff = (context.type_affinity or {}).get(candidate.place_type, 0.5)
        e_score  = embedding_score(
            user_id,
            candidate.place_id,
            candidate.place_name or "",
            candidate.place_description or "",
            interaction_types,
        )
        if e_score == 0.5 and type_aff != 0.5:
            e_score = type_aff

        # ── 4. Weighted combination ─────────────────────────────────────────
        ai = (
            config.BANDIT_WEIGHT   * b_score +
            config.SEQUENCE_WEIGHT * s_score +
            config.EMBEDDING_WEIGHT * e_score
        )

        # ── 5. Pricing enrichment (always run — fast, cacheable) ───────────
        place_dict: dict[str, Any] = {
            "id":               candidate.place_id,
            "name":             candidate.place_name or "",
            "type":             candidate.place_type,
            "description":      candidate.place_description or "",
            "address":          candidate.address or "",
            "rating":           candidate.rating,
            "userRatingsTotal": candidate.user_ratings_total or 0,
            "priceLevel":       candidate.price_level,
            "tags":             candidate.tags or [],
            "reviews":          candidate.reviews or [],
        }
        enrichment = enrich_place(place_dict)
        pricing_on = bool(enrichment.get("pricing_enabled"))
        place_tier = enrichment.get("priceLevel") or "mid"

        # ── 6. Budget-fit scoring (only when consumer pricing applies) ───────
        if pricing_on:
            budget_adj, in_budget = _budget_fit_score(user_budget_tier, place_tier)
            ai += budget_adj
            if not in_budget:
                tier_order = {"cheap": 1, "mid": 2, "expensive": 3}
                u_n = tier_order.get(user_budget_tier, 2)
                p_n = tier_order.get(place_tier, 2)
                if p_n > u_n:
                    excess = p_n - u_n
                    ai = max(0.0, ai - 0.15 * excess)
            in_budget_final = in_budget
        else:
            in_budget_final = True

        # ── 7. Religion matching ──────────────────────────────────────────────
        religion = (context.religion or "").lower()
        ptype    = candidate.place_type.lower()
        is_religious_venue = ptype in ("church", "mosque", "worship", "prayer",
                                       "chapel", "temple", "masjid", "cathedral")

        if is_religious_venue and religion and religion not in ("", "prefer_not_to_say", "other"):
            # Determine place religion from type + name
            place_name_lower = (candidate.place_name or "").lower()
            place_desc_lower = (candidate.place_description or "").lower()
            place_text       = f"{ptype} {place_name_lower} {place_desc_lower}"

            is_mosque     = any(k in place_text for k in ("mosque", "masjid", "muslim", "jami", "islamic"))
            is_orthodox   = any(k in place_text for k in ("orthodox", "debre", "kidus", "kidist", "bete christian", "giorgis"))
            is_protestant = any(k in place_text for k in ("protestant", "evangelical", "mekane", "kale hiwot", "pentecost", "seventh"))
            is_catholic   = any(k in place_text for k in ("catholic", "franciscan"))
            is_generic_christian = not is_mosque and not is_orthodox and not is_protestant and not is_catholic

            match_result = {
                "muslim":    lambda: is_mosque,
                "orthodox":  lambda: is_orthodox or is_generic_christian,
                "protestant": lambda: is_protestant or is_generic_christian,
                "catholic":  lambda: is_catholic or is_generic_christian,
            }
            checker = match_result.get(religion)
            if checker is not None:
                if checker():
                    ai = min(1.0, ai + 0.08)   # Strong boost for matching denomination
                else:
                    ai = max(0.0, ai - 0.30)   # Strong penalty for mismatched denomination

        # ── 8. Weekend preference boost ────────────────────────────────────────
        wp = (context.weekend_preference or "").lower()
        if wp == "outdoor" and ptype in ("outdoor", "hiking", "park", "sports"):
            ai = min(1.0, ai + 0.04)
        elif wp == "hiking" and ptype in ("hiking", "outdoor", "park"):
            ai = min(1.0, ai + 0.05)
        elif wp == "indoor" and ptype in ("cinema", "museum", "art", "coffee", "cafe"):
            ai = min(1.0, ai + 0.03)

        # ── 9. Light RAG quality bump ──────────────────────────────────────
        rag = rag_score(place_dict)
        ai += 0.02 * rag.get("quality_score", 0.0)

        ai = round(max(0.0, min(1.0, ai)), 4)

        # ── 9. Optional LLM/template reason ────────────────────────────────
        reason: Optional[str] = None
        if context.explain:
            # Build a small user-signals dict to pass to the LLM helper
            user_signals = {
                "budget":             user_budget_tier,
                "interests":          context.interests or list(context.type_affinity.keys()),
                "weekendPreference":  context.weekend_preference or "",
                "religion":           context.religion or "",
                "session_intent":     context.session_intent or "",
                "time_of_day":        context.time_of_day or "",
            }
            place_for_llm = {
                **place_dict,
                "pricing_enabled": pricing_on,
                "priceLevel":     enrichment.get("priceLevel"),
                "estimatedCost":  enrichment["estimatedCost"] if pricing_on else {},
            }
            reason = generate_recommendation_reason(user_signals, place_for_llm, max_chars=160)

        return RankedPlace(
            place_id          = candidate.place_id,
            ai_score          = ai,
            bandit_score      = round(b_score, 4),
            sequence_score    = round(s_score, 4),
            embedding_score   = round(e_score, 4),
            pricing_enabled   = pricing_on,
            pricing_reason    = enrichment.get("pricing_reason"),
            price_level       = enrichment["priceLevel"] if pricing_on else None,
            price_confidence   = round(enrichment["priceConfidence"], 3),
            price_signals     = enrichment["priceSignals"],
            estimated_cost    = enrichment["estimatedCost"],
            price_category    = enrichment["priceCategory"],
            reason            = reason,
            budget_fit        = in_budget_final,
        )

    except Exception as exc:
        logger.warning("[predict] candidate %s failed: %s", candidate.place_id, exc)
        return RankedPlace(
            place_id=candidate.place_id,
            ai_score=0.5,
            bandit_score=0.5,
            sequence_score=0.5,
            embedding_score=0.5,
            pricing_enabled=False,
            budget_fit=True,
        )


# ─── Route ───────────────────────────────────────────────────────────────────

@router.post("/predict", response_model=PredictResponse, tags=["Inference"])
def predict(req: PredictRequest) -> PredictResponse:
    """
    Score and rank candidate places.

    The backend should merge:
      finalScore = 0.7 × rawScore + 0.3 × aiScore
    """
    t0 = time.perf_counter()

    ctx  = req.context or ContextIn()
    meta = get_meta()
    user_budget_tier = _resolve_budget_tier(ctx)

    # Pre-compute sequence distribution once for this request
    seq_model    = get_sequence_model()
    recent_types = ctx.recent_types or []
    seq_dist     = seq_model.predict_distribution(recent_types)
    interaction_types = recent_types

    results = [
        _score_candidate(
            req.user_id, cand, ctx, seq_dist, interaction_types, user_budget_tier,
        )
        for cand in req.candidates
    ]

    # Sort descending by ai_score
    results.sort(key=lambda r: r.ai_score, reverse=True)

    # Top predicted type from sequence model
    predicted_type: Optional[str] = None
    confidence: float = 0.0
    if seq_dist:
        predicted_type = max(seq_dist, key=seq_dist.__getitem__)
        confidence     = round(seq_dist[predicted_type], 4)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    if elapsed_ms > 800:
        logger.warning(
            "[predict] slow inference: %d ms for %d candidates (explain=%s)",
            elapsed_ms, len(results), bool(ctx.explain),
        )

    logger.info(
        "[predict] uid=%s candidates=%d top=%.3f budget=%s religion=%s weekend=%s elapsed=%dms",
        req.user_id, len(results),
        results[0].ai_score if results else 0.0,
        user_budget_tier or "—",
        ctx.religion or "—",
        ctx.weekend_preference or "—",
        elapsed_ms,
    )

    return PredictResponse(
        ranked_places  = results,
        model_version  = meta.get("version", "v0"),
        inference_ms   = elapsed_ms,
        predicted_type = predicted_type,
        confidence     = confidence,
        llm_enabled    = is_llm_enabled(),
    )
