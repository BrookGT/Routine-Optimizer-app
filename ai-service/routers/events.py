"""
routers/events.py — POST /events/rank

Ranks a list of candidate events using the user's preference profile.

Request body:
  {
    "user_id": "uid",
    "user_profile": {
      "interests": ["music", "tech"],
      "typeAffinity": { "music": 0.8, "tech": 0.6 },
      "religion": "protestant",
      "weekendPreference": "outdoor",
      "eventInterests": ["tech", "social"],
      "dailyRoutine": {}
    },
    "events": [
      { "id": "...", "title": "...", "category": "music", "date": "ISO", ... }
    ]
  }

Response:
  {
    "ranked": [
      { "id": "...", "score": 0.87, ...event_fields }
    ]
  }
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Events"])


# ─── Request / Response schemas ───────────────────────────────────────────────

class UserProfile(BaseModel):
    interests: list[str] = []
    typeAffinity: dict[str, float] = {}
    religion: str = ""
    weekendPreference: str = ""
    eventInterests: list[str] = []
    dailyRoutine: dict = {}


class EventCandidate(BaseModel):
    id: str
    title: str
    category: str = "other"
    date: str = ""
    location: str = ""
    description: str = ""
    image: str = ""
    source_url: str = ""
    source: str = ""


class RankEventsRequest(BaseModel):
    user_id: str = ""
    user_profile: UserProfile = UserProfile()
    events: list[EventCandidate] = []


class RankedEvent(BaseModel):
    id: str
    title: str
    category: str
    date: str
    location: str
    image: str
    source_url: str
    score: float


# ─── Scoring helpers ──────────────────────────────────────────────────────────

def _days_until(iso_date: str) -> float:
    """
    Returns days between now and the event date.
    Negative means the event is in the past.
    """
    if not iso_date:
        return 30.0
    try:
        event_dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (event_dt - now).total_seconds() / 86400.0
    except Exception:
        return 30.0


def _score_event(event: EventCandidate, profile: UserProfile) -> float:
    """
    Compute a personalisation score in [0, 1] for one event.

    Factors:
      - Category affinity from typeAffinity dict                    (weight 0.40)
      - Combined interest + eventInterests keyword match            (weight 0.30)
      - Temporal relevance (sooner = better, past = penalty)        (weight 0.20)
      - Religion-based category boost                               (bonus  0.05)
      - weekendPreference / outdoor category boost                  (bonus  0.05)
    """
    score = 0.0

    # 1. Type affinity (supports both normalised [0,1] and raw [-50,50] ranges)
    raw_affinity = profile.typeAffinity.get(event.category, 0.0)
    # Normalise raw affinity: values outside [0,1] are treated as [-50,50] scale
    if raw_affinity > 1.0 or raw_affinity < 0.0:
        affinity = (raw_affinity + 50.0) / 100.0
    else:
        affinity = raw_affinity
    score += 0.40 * max(0.0, min(affinity, 1.0))

    # 2. Combined interest keyword match (interests + eventInterests)
    text = f"{event.title} {event.description} {event.category}".lower()
    all_interests = list(profile.interests) + list(profile.eventInterests)
    if all_interests:
        matched = sum(1 for interest in all_interests if interest.lower() in text)
        interest_score = min(matched / len(all_interests), 1.0)
    else:
        interest_score = 0.0
    score += 0.30 * interest_score

    # 3. Temporal relevance — prefer events in the next 0–14 days
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

    # 4. Religion-based boost: surface religious events for users who set a religion
    if (
        profile.religion
        and profile.religion not in ("", "prefer_not_to_say")
        and event.category.lower() in ("religious", "church", "mosque", "worship", "faith")
    ):
        score += 0.05

    # 5. Weekend preference boost
    if profile.weekendPreference:
        wp = profile.weekendPreference.lower()
        cat = event.category.lower()
        if wp == "outdoor" and cat in ("outdoor", "hiking", "sports", "nature"):
            score += 0.05
        elif wp == "hiking" and cat in ("hiking", "outdoor", "nature"):
            score += 0.05
        elif wp == "indoor" and cat in ("indoor", "cinema", "art", "museum", "workshop"):
            score += 0.05

    return round(min(score, 1.0), 4)


# ─── Route ───────────────────────────────────────────────────────────────────

@router.post("/events/rank", summary="Rank events by user preferences")
def rank_events(body: RankEventsRequest):
    """
    Score and rank candidate events based on the provided user profile.
    Returns top events sorted by descending score.
    """
    if not body.events:
        return {"ranked": []}

    scored = []
    for ev in body.events:
        s = _score_event(ev, body.user_profile)
        scored.append({
            "id": ev.id,
            "title": ev.title,
            "category": ev.category,
            "date": ev.date,
            "location": ev.location,
            "image": ev.image,
            "source_url": ev.source_url,
            "score": s,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)

    logger.info(
        "[events/rank] user=%s  candidates=%d  top_score=%.3f  religion=%s  weekend=%s  event_interests=%s",
        body.user_id, len(scored), scored[0]["score"] if scored else 0,
        body.user_profile.religion or "—",
        body.user_profile.weekendPreference or "—",
        ",".join(body.user_profile.eventInterests) or "—",
    )

    return {"ranked": scored}
