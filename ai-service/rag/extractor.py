"""
rag/extractor.py — Deterministic signal extraction from place text.

`extract_signals(place)` returns a structured dict of cues that downstream
code can use:

    {
        "price_hints":   ["expensive", "luxury"],     # cheap | mid | expensive
        "quality_hints": ["popular", "recommended"],  # popular, romantic, family-friendly...
        "category_hints":["lounge", "rooftop"],       # extra category cues
        "highlights":    ["rooftop view", ...]        # short noun phrases for explanations
    }

This is intentionally rule-based and explainable — every cue has a clear
provenance.  It runs in <1 ms per place.
"""

from __future__ import annotations

import re
from typing import Any

# ── Lexicons ─────────────────────────────────────────────────────────────────

_PRICE_LEXICON: dict[str, str] = {
    # Cheap signals
    "cheap": "cheap", "affordable": "cheap", "budget": "cheap",
    "value": "cheap", "inexpensive": "cheap", "low-cost": "cheap",
    "local": "cheap", "traditional": "cheap", "popular": "cheap",
    "mercato": "cheap", "sook": "cheap", "souq": "cheap", "kibat": "cheap",

    # Mid signals
    "mid-range": "mid", "moderate": "mid", "casual": "mid",
    "bistro": "mid", "café": "mid", "cafe": "mid", "lounge": "mid",

    # Expensive signals
    "luxury": "expensive", "premium": "expensive",
    "fine dining": "expensive", "5-star": "expensive", "five star": "expensive",
    "exclusive": "expensive", "rooftop": "expensive", "vip": "expensive",
    "high-end": "expensive", "upscale": "expensive", "chic": "expensive",
}

_QUALITY_LEXICON: tuple[str, ...] = (
    "popular", "famous", "recommended", "hidden gem", "must visit", "must-visit",
    "romantic", "family-friendly", "family friendly", "kid-friendly", "kid friendly",
    "quiet", "lively", "trendy", "cosy", "cozy", "scenic", "panoramic",
    "instagrammable", "authentic", "buzzy", "hipster", "retro",
)

_CATEGORY_HINTS: tuple[str, ...] = (
    "rooftop", "garden", "terrace", "sky bar", "lounge", "bistro",
    "buffet", "tea room", "pool", "spa", "co-working", "coworking",
    "library", "bookstore", "art gallery", "museum",
)

# Match noun phrases like "rooftop view", "live music", "ocean view"
_HIGHLIGHT_RE = re.compile(
    r"\b("
    r"rooftop view|sky view|ocean view|mountain view|panoramic view|"
    r"live music|live band|outdoor seating|garden seating|"
    r"free wifi|free wi-?fi|"
    r"vegan options?|vegetarian options?|halal options?|"
    r"lake view|coffee bar|all-day breakfast|"
    r"private dining|private rooms?|"
    r"pet[- ]friendly|family[- ]friendly|kid[- ]friendly"
    r")\b",
    re.I,
)


def _gather_text(place: dict[str, Any]) -> str:
    """Concatenate place text (name, description, reviews, address)."""
    parts: list[str] = []
    for key in ("name", "title", "description", "summary", "address",
                "vicinity", "formatted_address"):
        v = place.get(key)
        if isinstance(v, str):
            parts.append(v)

    # Review texts (Google Places format)
    for key in ("reviews", "user_reviews"):
        v = place.get(key)
        if isinstance(v, list):
            for r in v[:8]:
                if isinstance(r, dict):
                    parts.append(str(r.get("text", "")))
                elif isinstance(r, str):
                    parts.append(r)

    # Tag/category arrays
    for key in ("tags", "categories", "types"):
        v = place.get(key)
        if isinstance(v, list):
            parts.extend(str(x) for x in v)

    return " ".join(p for p in parts if p)


def extract_signals(place: dict[str, Any]) -> dict[str, list[str]]:
    """Returns the structured cue dict described in the module docstring."""
    text = _gather_text(place).lower()
    if not text:
        return {
            "price_hints":   [],
            "quality_hints": [],
            "category_hints": [],
            "highlights":    [],
        }

    # Price hints (deduplicate by tier label, preserve order of first occurrence)
    price_hits: list[str] = []
    seen_tiers: set[str]  = set()
    for kw, tier in _PRICE_LEXICON.items():
        if kw in text and tier not in seen_tiers:
            price_hits.append(tier)
            seen_tiers.add(tier)

    quality_hits   = [w for w in _QUALITY_LEXICON if w in text]
    category_hits  = [w for w in _CATEGORY_HINTS if w in text]
    highlights     = sorted({m.group(1).lower() for m in _HIGHLIGHT_RE.finditer(text)})

    return {
        "price_hints":   price_hits,
        "quality_hints": quality_hits,
        "category_hints": category_hits,
        "highlights":    highlights,
    }


def score_keywords(place: dict[str, Any]) -> dict[str, float]:
    """
    Returns light numeric scores derived from extracted signals.

    Useful for blending into AI scores without going through the LLM:
      - quality_score:      ratio of quality hits → [0, 1]
      - extraction_count:   total number of cues found (raw)

    The numbers stay small (max 1.0) so the caller can blend at low weights.
    """
    s = extract_signals(place)
    quality = min(1.0, len(s["quality_hints"]) / 5.0)
    cues    = len(s["price_hints"]) + len(s["quality_hints"]) + len(s["highlights"])
    return {
        "quality_score":   round(quality, 3),
        "extraction_count": float(cues),
    }
