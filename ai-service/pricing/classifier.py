"""
pricing/classifier.py — Classify a place into 'cheap | mid | expensive'.

Signal priority (highest → lowest):
  1. Brand-specific name hits (Skylight, Hyatt, etc.)   — very high confidence
  2. Google `priceLevel` hint (0–4 or string)            — high confidence
  3. Luxury / cheap keyword hits in name/description     — medium-high confidence
  4. Area reputation (Bole sub-areas, Mercato, etc.)    — medium confidence
  5. Rating × review count heuristic                     — lower confidence
  6. Default: mid                                        — low confidence

The area tier map fixes the earlier problem where 'bole' was blindly mapped to
expensive.  Bole is a mixed-income area — only specific Bole sub-zones or hotel
names warrant the expensive tag.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


# ── 1. Brand / specific luxury names ────────────────────────────────────────

_EXPENSIVE_BRANDS: tuple[str, ...] = (
    "skylight hotel", "hyatt regency", "hyatt", "sheraton addis",
    "sheraton", "radisson blu", "radisson", "hilton", "marriott",
    "ramada", "intercontinental", "kempinski", "ellilly", "elilly",
    "golden tulip", "capital hotel", "elilly international", "trinity hotel",
    "best western plus", "golden tulip",
)

# Generic luxury markers — apply when NOT combined with cheap/local signals
_LUXURY_KEYWORDS: tuple[str, ...] = (
    "luxury", "premium", "fine dining", "five star", "5-star", "5 star",
    "exclusive club", "vip lounge", "sky bar", "rooftop bar",
    "boutique hotel", "high-end", "upscale", "gourmet",
)

# Cheap markers — very distinctive
_CHEAP_KEYWORDS: tuple[str, ...] = (
    "mercato", "merkato", "sook", "souq", "kibat",
    "local restaurant", "local food", "tej bet", "tella bet", "buna bet",
    "enjera bet", "local kitfo", "traditional injera",
    "street food", "addis ketema", "shola market",
    "cheap", "budget restaurant", "affordable",
    # Common low-tier chains / phrases
    "kategna", "yod abyssinia local",   # Kategna is cheap-mid local chain
)

# Mid-range markers
_MID_KEYWORDS: tuple[str, ...] = (
    "cafe", "café", "bistro", "pastry", "pizzeria", "grill room",
    "garden restaurant", "lounge", "tomoca", "kaldi's", "kaldis",
    "burger king", "pizza hut",
)

# ── 2. Area reputation map ────────────────────────────────────────────────────
# Ordered longest → shortest so "bole medhane alem" matches before "bole".
# Tier confidence: areas provide context, not definitive classification.
# (expensive area + no cheap signals → expensive; but "local food" overrides)

_AREA_TIERS: tuple[tuple[str, str], ...] = (
    # Expensive sub-zones
    ("bole internacional", "expensive"),
    ("bole international", "expensive"),
    ("bole land mark", "expensive"),
    ("bole road",      "expensive"),   # Bole Road strip = upscale restaurants
    ("airport",        "expensive"),   # airport-adjacent → expensive
    ("edna mall",      "mid"),
    # General Bole = mid (common cafes, mid restaurants — not automatically expensive)
    ("bole",           "mid"),
    # Mid-range neighborhoods
    ("old airport",    "mid"),
    ("kazanchis",      "mid"),
    ("atlas",          "mid"),
    ("sarbet",         "mid"),
    ("gerji",          "mid"),
    ("megenagna",      "mid"),
    ("haya hulet",     "mid"),
    ("22 mazoria",     "mid"),
    ("summit",         "mid"),
    ("jemo",           "mid"),
    ("ayat",           "mid"),
    # Budget neighborhoods
    ("mercato",        "cheap"),
    ("merkato",        "cheap"),
    ("addis ketema",   "cheap"),
    ("shola",          "cheap"),
    ("saris",          "cheap"),
    ("piazza",         "cheap"),
    ("kality",         "cheap"),
    ("lideta",         "cheap"),
    ("akaki",          "cheap"),
    ("kolfe",          "cheap"),
    ("gulele",         "cheap"),
)

# Compiled regex — one pass for keywords, one for area detection
_BRAND_RE   = re.compile(r"|".join(re.escape(k) for k in _EXPENSIVE_BRANDS), re.I)
_LUXURY_RE  = re.compile(r"|".join(re.escape(k) for k in _LUXURY_KEYWORDS),  re.I)
_CHEAP_RE   = re.compile(r"|".join(re.escape(k) for k in _CHEAP_KEYWORDS),   re.I)
_MID_RE     = re.compile(r"|".join(re.escape(k) for k in _MID_KEYWORDS),     re.I)


# ── Text collector ────────────────────────────────────────────────────────────

def _gather_text(place: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("name", "title", "description", "summary", "address",
                "vicinity", "formatted_address"):
        v = place.get(key)
        if isinstance(v, str):
            parts.append(v)
    for key in ("tags", "categories", "types"):
        v = place.get(key)
        if isinstance(v, list):
            parts.extend(str(x) for x in v)
    for key in ("reviews", "user_reviews"):
        v = place.get(key)
        if isinstance(v, list):
            for r in v[:5]:
                if isinstance(r, dict):
                    parts.append(str(r.get("text", "")))
                elif isinstance(r, str):
                    parts.append(r)
    return " ".join(p for p in parts if p)


# ── Area lookup ───────────────────────────────────────────────────────────────

def _detect_area_tier(text: str) -> str | None:
    """Returns area-based tier or None.  Longest match wins."""
    lower = text.lower()
    for area, tier in _AREA_TIERS:   # ordered longest → shortest at definition
        if area in lower:
            return tier
    return None


# ── Google priceLevel hint ────────────────────────────────────────────────────

def _from_google(place: dict[str, Any]) -> tuple[str | None, float, str | None]:
    pl = place.get("priceLevel") or place.get("price_level") or place.get("googlePriceLevel")
    if pl is None:
        return None, 0.0, None

    if isinstance(pl, str):
        s = pl.strip().lower()
        if "inexp" in s or "free" in s:
            return "cheap",     0.85, f"google_price_level={pl}"
        if "moderate" in s or "mid" in s:
            return "mid",       0.85, f"google_price_level={pl}"
        if "expensive" in s or "very_exp" in s:
            return "expensive", 0.85, f"google_price_level={pl}"
        return None, 0.0, None

    try:
        n = int(pl)
        if n <= 1: return "cheap",     0.85, f"google_price_level={n}"
        if n == 2: return "mid",       0.80, f"google_price_level={n}"
        return "expensive", 0.85, f"google_price_level={n}"
    except (TypeError, ValueError):
        return None, 0.0, None


# ── Rating heuristic ──────────────────────────────────────────────────────────

def _from_rating(place: dict[str, Any]) -> tuple[str | None, float, list[str]]:
    rating  = place.get("rating")
    reviews = place.get("userRatingsTotal") or place.get("user_ratings_total") or 0
    try:
        r = float(rating) if rating is not None else None
        n = int(reviews)
    except (TypeError, ValueError):
        return None, 0.0, []

    if r is None:
        return None, 0.0, []
    if r >= 4.6 and n >= 800:
        return "expensive", 0.55, [f"rating={r} reviews={n}"]
    if r >= 4.3 and n >= 200:
        return "mid",       0.45, [f"rating={r} reviews={n}"]
    if r <= 3.0:
        return "cheap",     0.35, [f"rating={r}"]
    return None, 0.0, []


# ── Main classifier ───────────────────────────────────────────────────────────

def classify_place(place: dict[str, Any]) -> tuple[str, float, list[str]]:
    """
    Returns (tier, confidence ∈ [0,1], signals).

    Signals are short strings explaining the classification — fed to the LLM
    prompt for transparency and used by the mobile "why this price" tooltip.
    """
    if not isinstance(place, dict):
        return "mid", 0.20, ["fallback_default"]

    text = _gather_text(place)
    lower = text.lower()

    # ── 1. Brand hit — highest priority ───────────────────────────────────────
    brand_hits = _BRAND_RE.findall(text)
    if brand_hits:
        sig = f"brand={','.join(sorted({h.lower() for h in brand_hits}))}"
        return "expensive", 0.92, [sig]

    # ── 2. Cheap keyword hit ───────────────────────────────────────────────────
    cheap_hits = _CHEAP_RE.findall(text)
    has_cheap  = bool(cheap_hits)

    # ── 3. Google priceLevel ──────────────────────────────────────────────────
    g_tier, g_conf, g_sig = _from_google(place)

    # ── 4. Luxury keyword hit (only valid when no cheap signals present) ───────
    lux_hits  = [] if has_cheap else _LUXURY_RE.findall(text)
    has_lux   = bool(lux_hits)

    # ── 5. Area reputation ────────────────────────────────────────────────────
    area_tier = _detect_area_tier(text)

    # ── 6. Mid keyword hit ────────────────────────────────────────────────────
    mid_hits  = _MID_RE.findall(text)
    has_mid   = bool(mid_hits)

    # ── 7. Rating heuristic ───────────────────────────────────────────────────
    r_tier, r_conf, r_sigs = _from_rating(place)

    # ── Decision logic ────────────────────────────────────────────────────────
    # Cheap keywords trump area/luxury (e.g. "local sook near Bole" → cheap)
    if has_cheap:
        sigs = [f"cheap_kw={','.join(sorted({h.lower() for h in cheap_hits}))[:60]}"]
        return "cheap", min(0.88, 0.55 + 0.05 * len(cheap_hits)), sigs

    # Google priceLevel is authoritative if the cheap check already passed
    if g_tier:
        if has_lux and g_tier == "mid":
            # Luxury keyword + google says mid → upgrade to expensive
            return "expensive", min(0.80, g_conf + 0.05), [g_sig, "luxury_kw_upgrade"]
        return g_tier, g_conf, [g_sig] if g_sig else []

    # Luxury keywords (when no cheap context) → expensive
    if has_lux:
        sigs = [f"luxury_kw={','.join(sorted({h.lower() for h in lux_hits}))[:60]}"]
        # If cheap area (e.g. "luxury local food at Mercato") → back-off to mid
        if area_tier == "cheap":
            return "mid", 0.50, sigs + ["area_override=cheap"]
        return "expensive", min(0.82, 0.60 + 0.05 * len(lux_hits)), sigs

    # Build weighted vote from area + rating
    candidates: list[tuple[str, float, list[str]]] = []
    if area_tier:
        candidates.append((area_tier, 0.52, [f"area={area_tier}"]))
    if r_tier:
        candidates.append((r_tier, r_conf, r_sigs))
    if has_mid and not area_tier:
        mid_conf = min(0.60, 0.38 + 0.05 * len(mid_hits))
        candidates.append(("mid", mid_conf, [f"mid_kw={','.join(sorted({h.lower() for h in mid_hits}))[:40]}"]))

    if not candidates:
        return "mid", 0.20, ["fallback_default"]

    bucket: dict[str, list[float]] = {}
    sigs_map: dict[str, list[str]] = {}
    for tier, conf, sigs in candidates:
        bucket.setdefault(tier, []).append(conf)
        sigs_map.setdefault(tier, []).extend(sigs)

    best = max(bucket, key=lambda t: sum(bucket[t]))
    conf = min(0.90, sum(bucket[best]) / max(1, len(candidates)))
    return best, round(conf, 3), sigs_map[best]
