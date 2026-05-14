"""
pricing/estimator.py — Produce human-readable estimatedCost ranges.

Given a category (dining/lodging/transport/...) and a tier
(cheap/mid/expensive), returns a dict ready to render in the UI:

    {
        "meal":   "600–1500 ETB",
        "coffee": "70–150 ETB"
    }

Open-ended upper bounds are formatted as "3500+ ETB".
"""

from __future__ import annotations

from .dataset import PRICE_RANGES


def _format_range(low: float, high: float | None) -> str:
    if high is None:
        return f"{int(low)}+ ETB"
    return f"{int(low)}–{int(high)} ETB"


def estimate_cost(category: str, tier: str) -> dict[str, str]:
    """
    Returns the per-item cost ranges for a given category & tier.

    Example:
      estimate_cost("dining", "mid")
        → {"meal": "600–1500 ETB", "coffee": "70–150 ETB", "snack": "200–500 ETB"}

    Falls back to dining/mid when the inputs are unknown.
    """
    cat = (category or "").strip().lower()
    t   = (tier or "").strip().lower()

    cat_ranges = PRICE_RANGES.get(cat) or PRICE_RANGES["dining"]
    tier_ranges = cat_ranges.get(t) or cat_ranges.get("mid") or {}

    return {item: _format_range(low, high) for item, (low, high) in tier_ranges.items()}


def estimate_cost_numeric(category: str, tier: str) -> dict[str, dict[str, float | None]]:
    """
    Like estimate_cost but returns the raw numeric bounds — useful for
    downstream filtering or budget comparison (not for display).

    Returns:
      {item: {"min": float, "max": float|None}}
    """
    cat = (category or "").strip().lower()
    t   = (tier or "").strip().lower()

    cat_ranges = PRICE_RANGES.get(cat) or PRICE_RANGES["dining"]
    tier_ranges = cat_ranges.get(t) or cat_ranges.get("mid") or {}

    return {
        item: {"min": float(low), "max": (float(high) if high is not None else None)}
        for item, (low, high) in tier_ranges.items()
    }
