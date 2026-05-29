"""Tests for scrapers/base_scraper.py — text and category normalization."""

from scrapers.base_scraper import clean_text, normalise_category, parse_iso_date


def test_clean_text_strips_emoji_and_whitespace():
    assert clean_text("  Hello   world  🎉  ") == "Hello world"


def test_normalise_category_maps_concert_to_music():
    assert normalise_category("Live concert tonight") == "music"


def test_normalise_category_unknown_defaults_other():
    assert normalise_category("") == "other"
    assert normalise_category("random xyz") == "other"


def test_parse_iso_date_parses_standard_format():
    iso = parse_iso_date("2026-06-15")
    assert iso.startswith("2026-06-15")
