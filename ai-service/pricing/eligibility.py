"""
pricing/eligibility.py — Context-aware: should we show price estimates?

Heuristic stack (cheap to evaluate):
  1. Hard-off categories (church, mosque, park, public library trail, …)
  2. Hard-on categories (cafe, restaurant, hotel paid gym cinema …)
  3. FREE_KEYWORDS disable (public, volunteer, mass, …)
  4. PAID_KEYWORDS enable (ticket, coworking, membership, …)
  5. Google Maps price_level present (1–4) → usually implies monetised venue
     (still respects hard-off religious / free public placetype unless strong paid cues)
"""

from __future__ import annotations

import re
from typing import Any

# ── Types that virtually never warrant consumer price cards ───────────────────
HARD_OFF_TYPES: frozenset[str] = frozenset(
    {
        "church",
        "mosque",
        "worship",
        "prayer",
        "chapel",
        "cathedral",
        "synagogue",
        "shrine",
        "temple",
        "hindu_temple",
        "park",
        "plaza",
        "monument",
        "cemetery",
        "memorial",
        "playground",
        "hiking",
        "trail",
        "walking",
        "viewpoint",
        "lookout",
        "bridge",
        "town_square",
        "public_space",
    }
)

# Library default: no price (public reading); cafe-in-library handled by PAID_KEYWORDS
LIBRARY_TYPES: frozenset[str] = frozenset({"library"})

# Outdoor without commercial operator — usually free
SOFT_OFF_OUTDOOR: frozenset[str] = frozenset({"outdoor"})

# Types where spending is normal / expected
HARD_ON_TYPES: frozenset[str] = frozenset(
    {
        "coffee",
        "cafe",
        "restaurant",
        "bakery",
        "bar",
        "lounge",
        "night_club",
        "hotel",
        "lodge",
        "guesthouse",
        "gym",
        "yoga",
        "fitness",
        "spa",
        "cinema",
        "club",
        "music",
        "shop",
        "shopping",
        "mall",
        "store",
        "market",
        "taxi",
        "bus",
        "ride",
        "workspace",
        "coworking",
        "office",
        "museum",
        "gallery",
        "art",
        "theater",
        "stadium",
        "sports",  # often paid access / membership
        "event",
        "events",
        "concert",
        "social",
    }
)

# Multi-word / phrase free signals (order: longer first for matching)
_FREE_PHRASES: tuple[str, ...] = (
    "free entry",
    "no entrance fee",
    "entrance free",
    "open to the public",
    "public park",
    "public library",
    "church service",
    "community center",
    "community centre",
    "volunteer event",
    "religious service",
    "public gathering",
    "walking area",
    "prayer only",
    "free event",
    "donation only",
    "free admission",
    "no ticket",
    "free and open",
    "public space",
    "national park",  # often tiny fee but user asked no price for parks
    "university campus",
    "campus library",
    "study area",
    "public garden",
)


def _normalize_type(place: dict[str, Any]) -> str:
    raw = (
        place.get("type")
        or place.get("place_type")
        or place.get("category")
        or ""
    )
    s = str(raw).strip().lower().replace(" ", "_")
    if s in {"coffee_shop", "coffeeshop"}:
        return "coffee"
    if s in {"movie_theater", "movie_theatre"}:
        return "cinema"
    if s in {"performing_arts_theater"}:
        return "theater"
    return s


def _gather_text(place: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in (
        "name",
        "title",
        "description",
        "summary",
        "address",
        "vicinity",
        "formatted_address",
    ):
        v = place.get(key)
        if isinstance(v, str):
            parts.append(v)
    for key in ("tags", "categories", "types"):
        v = place.get(key)
        if isinstance(v, list):
            parts.extend(str(x) for x in v)
    rev = place.get("reviews") or place.get("user_reviews") or []
    if isinstance(rev, list):
        for r in rev[:6]:
            if isinstance(r, dict):
                parts.append(str(r.get("text", "")))
            elif isinstance(r, str):
                parts.append(r)
    return " ".join(p for p in parts if p).lower()


_FREE_RE = re.compile(
    "|".join(re.escape(p) for p in sorted(_FREE_PHRASES, key=len, reverse=True)),
    re.I,
)
# Single-token high-signal free words (careful with substrings)
_FREE_WORD_BOUNDARY = re.compile(
    r"\b("
    r"public|volunteer|nonprofit|non-profit|worship\s+only|mass\b|sermon|"
    r"mosque|church\b|prayer\s+hall|free\b|donation-based|donations?\b"
    r")\b",
    re.I,
)

_PAID_RE = re.compile(
    r"|".join(
        re.escape(p)
        for p in (
            "luxury",
            "coworking",
            "co-working",
            "membership",
            "membership plan",
            "subscription",
            "reservation required",
            "booking required",
            "book now",
            "ticket",
            "tickets",
            "cover charge",
            "cover fee",
            "buffet",
            "admission fee",
            "entrance fee",
            "day pass",
            "day-pass",
            "premium lounge",
            "vip",
            "5-star",
            "five star",
            "hotel",
            "conference fee",
            "paid event",
            "paid training",
            "training course",
            "workshop fee",
        )
    ),
    re.I,
)


def _google_implies_paid(place: dict[str, Any]) -> bool:
    pl = place.get("priceLevel") or place.get("price_level") or place.get("googlePriceLevel")
    if pl is None:
        return False
    try:
        n = int(pl)
        return n >= 1
    except (TypeError, ValueError):
        if isinstance(pl, str):
            s = pl.lower()
            return "moderate" in s or "expensive" in s or "very_exp" in s
    return False


def resolve_pricing_eligibility(place: dict[str, Any]) -> dict[str, Any]:
    """
    Returns:
        pricing_enabled: bool
        reason: short human string
        ambiguous: bool — LLM may refine
        signals: list[str] — audit trail
    """
    if not isinstance(place, dict):
        return {
            "pricing_enabled": False,
            "reason": "Invalid place data",
            "ambiguous": False,
            "signals": ["invalid"],
        }

    ptype = _normalize_type(place)
    text = _gather_text(place)
    signals: list[str] = []

    paid_kw = bool(_PAID_RE.search(text))
    free_kw = bool(_FREE_RE.search(text)) or bool(_FREE_WORD_BOUNDARY.search(text))
    google_paid = _google_implies_paid(place)

    # Explicit free signals on an otherwise commercial type
    if free_kw:
        signals.append("free_keyword")

    # ── Hard-off: religious & clearly public infrastructure ──────────────────
    if ptype in HARD_OFF_TYPES:
        if paid_kw and "ticket" in text and ptype not in {"church", "mosque", "worship", "chapel", "cathedral"}:
            # e.g. concert *at* a venue named with church? rare
            pass
        else:
            return {
                "pricing_enabled": False,
                "reason": "Religious or public place — no typical consumer spend",
                "ambiguous": False,
                "signals": signals + [f"hard_off_type={ptype}"],
            }

    # ── Library: off unless cafe / coworking / paid signals ─────────────────
    if ptype in LIBRARY_TYPES or re.search(r"\blibrary\b", text):
        if paid_kw or "cafe" in text or "coffee" in text or "coworking" in text or google_paid:
            signals.append("library_paid_signal")
        else:
            return {
                "pricing_enabled": False,
                "reason": "Public library — reading is typically free",
                "ambiguous": False,
                "signals": signals + ["library_public"],
            }

    # ── Outdoor / park-like: off unless paid attraction ─────────────────────
    if ptype in SOFT_OFF_OUTDOOR:
        if paid_kw or google_paid or any(
            x in text for x in ("adventure park", "water park", "resort", "glamping", "zipline")
        ):
            signals.append("outdoor_commercial")
        else:
            return {
                "pricing_enabled": False,
                "reason": "Outdoor / nature spot — usually no entry spend",
                "ambiguous": False,
                "signals": signals + ["outdoor_free"],
            }

    # ── Events: only when likely ticketed / paid ─────────────────────────────
    if ptype in {"event", "events", "concert", "social"}:
        if free_kw:
            return {
                "pricing_enabled": False,
                "reason": "Community or free event",
                "ambiguous": False,
                "signals": signals + ["event_free"],
            }
        has_money_mention = bool(
            re.search(r"\b(etb|birr|\d+)\b", text) and re.search(r"\b(ticket|price|fee|paid)\b", text)
        )
        if paid_kw or any(
            x in text
            for x in (
                "ticket",
                "concert",
                "show",
                "festival",
                "conference",
                "training",
                "workshop",
                "cover charge",
            )
        ) or has_money_mention:
            return {
                "pricing_enabled": True,
                "reason": "Ticketed or paid event — estimate shown",
                "ambiguous": False,
                "signals": signals + ["event_paid"],
            }
        # Unknown event — avoid fake ticket pricing
        return {
            "pricing_enabled": False,
            "reason": "Event without clear pricing context",
            "ambiguous": True,
            "signals": signals + ["event_ambiguous"],
        }

    # ── Strong paid keywords override remaining uncertainty ──────────────────
    if paid_kw:
        return {
            "pricing_enabled": True,
            "reason": "Reviews or description suggest paid access or services",
            "ambiguous": False,
            "signals": signals + ["paid_keyword"],
        }

    # ── Google price level on commercial-looking names ───────────────────────
    if google_paid and ptype not in HARD_OFF_TYPES:
        if free_kw and ptype in {"park", "library"}:
            pass
        else:
            return {
                "pricing_enabled": True,
                "reason": "Google Maps lists a price level for this venue",
                "ambiguous": False,
                "signals": signals + ["google_price_level"],
            }

    # ── Hard-on types ────────────────────────────────────────────────────────
    if ptype in HARD_ON_TYPES:
        if free_kw and ptype in {"restaurant", "cafe", "coffee", "bar"}:
            # "free wifi" shouldn't disable; only strong free entry
            if re.search(r"\bfree\s+(lunch|breakfast|buffet|meal)\b", text) or "complimentary food" in text:
                return {
                    "pricing_enabled": False,
                    "reason": "Listed as complimentary / free food offering",
                    "ambiguous": True,
                    "signals": signals + ["food_free_edge_case"],
                }
        return {
            "pricing_enabled": True,
            "reason": "Category usually involves spending",
            "ambiguous": False,
            "signals": signals + [f"hard_on_type={ptype}"],
        }

    # ── Free keyword without hard-on type ───────────────────────────────────
    if free_kw:
        return {
            "pricing_enabled": False,
            "reason": "Described as public, free, or community-oriented",
            "ambiguous": False,
            "signals": signals + ["free_keyword_block"],
        }

    # ── Default: no price (safer than fake mid estimates) ─────────────────
    return {
        "pricing_enabled": False,
        "reason": "No strong signal that typical spending applies",
        "ambiguous": True,
        "signals": signals + ["default_no_price"],
    }
