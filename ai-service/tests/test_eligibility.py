"""Tests for pricing/eligibility.py — when to show price estimates."""

from pricing.eligibility import resolve_pricing_eligibility


def test_church_has_pricing_disabled():
    result = resolve_pricing_eligibility({"type": "church", "name": "St. Mary"})
    assert result["pricing_enabled"] is False
    assert "hard_off_type" in " ".join(result["signals"])


def test_cafe_has_pricing_enabled():
    result = resolve_pricing_eligibility({"type": "cafe", "name": "Tomoca"})
    assert result["pricing_enabled"] is True
    assert result["ambiguous"] is False


def test_free_event_keyword_blocks_pricing():
    result = resolve_pricing_eligibility(
        {
            "type": "event",
            "name": "Community meetup",
            "description": "Free entry for everyone",
        }
    )
    assert result["pricing_enabled"] is False
    assert "event_free" in result["signals"]


def test_ticketed_event_enables_pricing():
    result = resolve_pricing_eligibility(
        {
            "type": "concert",
            "name": "Jazz night",
            "description": "Tickets available at the door",
        }
    )
    assert result["pricing_enabled"] is True
    assert "event_paid" in result["signals"]
