"""Tests for models/bandit.py — Thompson sampling bandit."""

from models.bandit import BanditModel


def test_cold_start_score_is_half():
    model = BanditModel()
    assert model.bandit_score("new-user", "gym") == 0.5


def test_save_increases_score():
    model = BanditModel()
    model.update("u1", "coffee", "save")
    model.update("u1", "coffee", "save")
    score = model.bandit_score("u1", "coffee")
    assert score > 0.5


def test_dismiss_decreases_score():
    model = BanditModel()
    model.update("u1", "gym", "save")
    before = model.bandit_score("u1", "gym")
    model.update("u1", "gym", "dismiss")
    model.update("u1", "gym", "dismiss")
    after = model.bandit_score("u1", "gym")
    assert after < before


def test_bulk_update_counts_valid_interactions():
    model = BanditModel()
    places = {"p1": {"type": "cafe"}}
    interactions = [
        {"userId": "u1", "placeId": "p1", "actionType": "click"},
        {"userId": "u1", "placeId": "p1", "actionType": "unknown"},
    ]
    assert model.bulk_update(interactions, places) == 1
