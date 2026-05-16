"""
routers/events.py — POST /events/rank

Ranks candidate events using the user's full onboarding profile.

Scoring pipeline:
  1. Category affinity (typeAffinity)                        weight 0.35
  2. Interest + eventInterest + weeklyActivity keyword match  weight 0.30
  3. Temporal relevance (sooner = better)                    weight 0.20
  4. Religion denomination match / HARD BLOCK                ±bonus
  5. Weekend preference boost                                +bonus
  6. Budget awareness (free vs paid events)                  +bonus / penalty
  7. Gender context (skip gender-exclusive events)           penalty

Hard contradiction rules:
  - Orthodox user → mosque / islamic events scored near-zero
  - Muslim user → church / christian events scored near-zero
  - Protestant / Catholic user → mosque scored near-zero
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Events"])

# ─── Activity → event category mapping ────────────────────────────────────────

ACTIVITY_TO_EVENT_CATEGORIES: dict[str, list[str]] = {
    "gym":        ["fitness", "sports", "health", "wellness"],
    "running":    ["fitness", "sports", "outdoor"],
    "yoga":       ["wellness", "fitness", "health"],
    "hiking":     ["outdoor", "adventure", "nature"],
    "cycling":    ["sports", "outdoor", "fitness"],
    "music":      ["music", "concert", "entertainment"],
    "art":        ["art", "culture", "gallery", "museum"],
    "coding":     ["tech", "technology", "workshop", "education"],
    "studying":   ["education", "workshop", "seminar"],
    "social":     ["social", "networking", "community"],
    "cooking":    ["food", "culinary", "cooking"],
    "movies":     ["cinema", "entertainment", "film"],
    "gaming":     ["gaming", "tech", "entertainment"],
    "prayer":     ["religious", "church", "mosque", "worship", "faith"],
    "meditation": ["wellness", "spiritual", "mindfulness"],
    "shopping":   ["shopping", "market", "sale", "expo"],
    "walking":    ["outdoor", "nature", "community"],
    "sports":     ["sports", "fitness", "athletic"],
    "reading":    ["education", "book", "culture"],
    "travel":     ["travel", "culture", "adventure"],
}

# ─── Religion classification helpers ──────────────────────────────────────────

MOSQUE_KEYWORDS    = frozenset(["mosque", "masjid", "mesjid", "jami", "jamia", "muslim", "islamic", "ramadan", "eid al", "eid ul", "salah", "quran"])
ORTHODOX_KEYWORDS  = frozenset(["orthodox", "debre", "kidus", "kidist", "kiddis", "bete christian", "giorgis", "medhanealem", "timkat", "meskel"])
PROTESTANT_KEYWORDS = frozenset(["protestant", "evangelical", "mekane yesus", "kale hiwot", "seventh", "adventist", "pentecost", "full gospel", "baptist"])
CATHOLIC_KEYWORDS  = frozenset(["catholic", "franciscan", "jesuit", "roman church"])
CHRISTIAN_KEYWORDS = frozenset(["church", "chapel", "worship", "prayer hall", "christian", "christmas", "easter"])


def _classify_event_religion(title: str, description: str, category: str) -> str:
    """Returns 'muslim' | 'orthodox' | 'protestant' | 'catholic' | 'christian' | ''."""
    text = f"{title} {description} {category}".lower()
    if any(k in text for k in MOSQUE_KEYWORDS):
        return "muslim"
    if any(k in text for k in ORTHODOX_KEYWORDS):
        return "orthodox"
    if any(k in text for k in PROTESTANT_KEYWORDS):
        return "protestant"
    if any(k in text for k in CATHOLIC_KEYWORDS):
        return "catholic"
    cat = category.lower()
    if cat in ("religious", "church", "worship", "faith") or any(k in text for k in CHRISTIAN_KEYWORDS):
        return "christian"
    return ""


def _religion_event_score(user_religion: str, event_religion: str) -> float:
    """
    Returns score adjustment for religion matching.
      Match:         +0.10 strong boost
      Compatible:    +0.03 small boost
      No religion:    0.00 neutral
      Contradiction: -0.50 hard penalty (contradictory = near zero)
    """
    if not event_religion:
        return 0.0  # secular event → no religion adjustment

    r = (user_religion or "").lower()
    if not r or r in ("other", "prefer_not_to_say"):
        return 0.0  # user has no preference → all events visible

    if r == "orthodox":
        if event_religion == "orthodox":
            return 0.10
        if event_religion == "christian":
            return 0.03
        return -0.50  # muslim/protestant/catholic events → hard penalty

    if r == "protestant":
        if event_religion == "protestant":
            return 0.10
        if event_religion == "christian":
            return 0.03
        return -0.50

    if r == "catholic":
        if event_religion == "catholic":
            return 0.10
        if event_religion == "christian":
            return 0.03
        return -0.50

    if r == "muslim":
        if event_religion == "muslim":
            return 0.10
        return -0.50  # christian events → hard penalty for muslim users

    return 0.0


# ─── Request / Response schemas ───────────────────────────────────────────────

class UserProfile(BaseModel):
    interests:         list[str]         = Field(default_factory=list)
    typeAffinity:      dict[str, float]  = Field(default_factory=dict)
    religion:          str               = ""
    gender:            str               = ""       # male|female|non_binary|prefer_not_to_say
    weekendPreference: str               = ""
    eventInterests:    list[str]         = Field(default_factory=list)
    weeklyActivities:  list[str]         = Field(default_factory=list)
    dailyRoutine:      dict              = Field(default_factory=dict)
    budgetTier:        str               = ""       # cheap|mid|expensive
    weeklyBudget:      float             = 0.0      # numeric ETB


class EventCandidate(BaseModel):
    id:          str
    title:       str
    category:    str  = "other"
    date:        str  = ""
    location:    str  = ""
    description: str  = ""
    image:       str  = ""
    source_url:  str  = ""
    source:      str  = ""
    is_paid:     bool = False    # true when the event has an entry fee
    price_tier:  str  = ""       # cheap|mid|expensive (optional)


class RankEventsRequest(BaseModel):
    user_id:      str         = ""
    user_profile: UserProfile = UserProfile()
    events:       list[EventCandidate] = Field(default_factory=list)


# ─── Scoring helpers ──────────────────────────────────────────────────────────

def _days_until(iso_date: str) -> float:
    if not iso_date:
        return 30.0
    try:
        event_dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (event_dt - now).total_seconds() / 86400.0
    except Exception:
        return 30.0


def _activity_event_match(weekly_activities: list[str], event_title: str, event_desc: str, event_cat: str) -> float:
    """Returns 0–0.12 boost based on how many of the user's weekly activities match the event."""
    if not weekly_activities:
        return 0.0
    text = f"{event_title} {event_desc} {event_cat}".lower()
    matched = 0
    total   = len(weekly_activities)
    for activity in weekly_activities:
        related_cats = ACTIVITY_TO_EVENT_CATEGORIES.get(activity.lower(), [activity.lower()])
        if any(cat in text for cat in related_cats):
            matched += 1
    if matched == 0:
        return 0.0
    return min(0.12, (matched / total) * 0.20)


def _budget_event_score(user_budget_tier: str, event: EventCandidate) -> float:
    """Returns penalty when a paid event is too expensive for the user's budget."""
    if not event.is_paid or not user_budget_tier:
        return 0.0
    event_tier = (event.price_tier or "mid").lower()
    order = {"cheap": 0, "mid": 1, "expensive": 2}
    u = order.get(user_budget_tier, 1)
    e = order.get(event_tier, 1)
    diff = e - u
    if diff <= 0:
        return 0.04   # affordable or cheaper paid event → small boost
    if diff == 1:
        return -0.10  # one tier above budget
    return -0.25      # luxury event for cheap user


def _gender_event_score(user_gender: str, event_text: str) -> float:
    """Returns penalty when event is clearly for a different gender."""
    if not user_gender or user_gender in ("prefer_not_to_say", "non_binary", ""):
        return 0.0
    text = event_text.lower()
    female_kw = ("ladies only", "women only", "female only", "women's event", "ladies event")
    male_kw   = ("men only", "gents only", "male only", "mens event")
    if user_gender == "male" and any(k in text for k in female_kw):
        return -0.20
    if user_gender == "female" and any(k in text for k in male_kw):
        return -0.20
    return 0.0


def _score_event(event: EventCandidate, profile: UserProfile) -> float:
    """
    Full onboarding-driven event scoring.
    """
    score = 0.0

    # 1. Type affinity
    raw_affinity = profile.typeAffinity.get(event.category, 0.0)
    affinity = (raw_affinity + 50.0) / 100.0 if (raw_affinity > 1.0 or raw_affinity < 0.0) else raw_affinity
    score += 0.35 * max(0.0, min(affinity, 1.0))

    # 2. Combined interest + activity keyword match
    text = f"{event.title} {event.description} {event.category}".lower()
    all_interests = list(profile.interests) + list(profile.eventInterests)
    if all_interests:
        matched = sum(1 for i in all_interests if i.lower() in text)
        score += 0.30 * min(matched / len(all_interests), 1.0)

    # Activity alignment boost (additive on top of interests)
    score = min(1.0, score + _activity_event_match(
        profile.weeklyActivities, event.title, event.description, event.category
    ))

    # 3. Temporal relevance
    days = _days_until(event.date)
    if days < 0:
        temporal = 0.0
    elif days <= 14:
        temporal = 1.0 - (days / 14.0) * 0.3
    elif days <= 60:
        temporal = 0.5
    else:
        temporal = 0.2
    score += 0.20 * temporal

    # 4. Religion match / hard filter
    event_religion = _classify_event_religion(event.title, event.description, event.category)
    rel_adj = _religion_event_score(profile.religion, event_religion)
    score = max(0.0, min(1.0, score + rel_adj))

    # 5. Weekend preference boost
    wp  = (profile.weekendPreference or "").lower()
    cat = event.category.lower()
    if wp == "outdoor" and cat in ("outdoor", "hiking", "sports", "nature"):
        score = min(1.0, score + 0.06)
    elif wp == "hiking" and cat in ("hiking", "outdoor", "nature"):
        score = min(1.0, score + 0.06)
    elif wp == "indoor" and cat in ("indoor", "cinema", "art", "museum", "workshop", "tech"):
        score = min(1.0, score + 0.05)
    elif wp == "social" and cat in ("social", "networking", "community"):
        score = min(1.0, score + 0.05)

    # 6. Budget awareness
    budget_tier = (profile.budgetTier or "").lower()
    if not budget_tier and profile.weeklyBudget:
        if profile.weeklyBudget <= 2000:
            budget_tier = "cheap"
        elif profile.weeklyBudget <= 10000:
            budget_tier = "mid"
        else:
            budget_tier = "expensive"
    score = max(0.0, min(1.0, score + _budget_event_score(budget_tier, event)))

    # 7. Gender context
    gender_adj = _gender_event_score(profile.gender, text)
    score = max(0.0, score + gender_adj)

    return round(min(score, 1.0), 4)


# ─── Route ───────────────────────────────────────────────────────────────────

@router.post("/events/rank", summary="Rank events by user preferences")
def rank_events(body: RankEventsRequest):
    """
    Score and rank candidate events.
    Returns events sorted by descending score.
    Contradictory events (wrong denomination for user's religion) are scored near-zero.
    """
    if not body.events:
        return {"ranked": []}

    scored = []
    for ev in body.events:
        s = _score_event(ev, body.user_profile)
        scored.append({
            "id":         ev.id,
            "title":      ev.title,
            "category":   ev.category,
            "date":       ev.date,
            "location":   ev.location,
            "image":      ev.image,
            "source_url": ev.source_url,
            "score":      s,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)

    logger.info(
        "[events/rank] user=%s candidates=%d top_score=%.3f religion=%s gender=%s "
        "budget=%s weekend=%s activities=%d",
        body.user_id, len(scored), scored[0]["score"] if scored else 0,
        body.user_profile.religion or "—",
        body.user_profile.gender or "—",
        body.user_profile.budgetTier or "—",
        body.user_profile.weekendPreference or "—",
        len(body.user_profile.weeklyActivities),
    )

    return {"ranked": scored}
