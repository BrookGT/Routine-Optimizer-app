"""Tests for pricing/classifier.py — place tier classification."""

from pricing.classifier import classify_place


def test_luxury_brand_classified_expensive():
    tier, conf, signals = classify_place({"name": "Hyatt Regency Addis"})
    assert tier == "expensive"
    assert conf >= 0.9
    assert any("brand=" in s for s in signals)


def test_cheap_keyword_wins_over_bole_area():
    tier, _, _ = classify_place(
        {
            "name": "Local food",
            "address": "Bole, Addis Ababa",
        }
    )
    assert tier == "cheap"


def test_google_price_level_mid():
    tier, conf, signals = classify_place({"name": "Cafe", "priceLevel": 2})
    assert tier == "mid"
    assert conf >= 0.8
    assert any("google_price_level" in s for s in signals)


def test_invalid_input_defaults_to_mid():
    tier, conf, signals = classify_place(None)
    assert tier == "mid"
    assert conf == 0.2
    assert "fallback_default" in signals
