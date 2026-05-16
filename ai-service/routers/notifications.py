"""
routers/notifications.py — POST /notifications/generate

Generates personalized, AI-driven notification content for the Wuloye app.

Endpoint:
  POST /notifications/generate

Request body:
  {
    "uid": "user123",
    "type": "morning" | "afternoon" | "evening" | "all",
    "profile": {
      "name": "Biruk",
      "wakeTime": "07:00",
      "sleepTime": "23:00",
      "budgetRange": "medium",
      "weeklyBudget": 500,
      "interests": ["coffee", "gym", "reading"],
      "religion": "orthodox",
      "weekendPreference": "outdoor",
      "eventInterests": ["religious", "tech"],
      "mealPreferences": ["ethiopian"],
      "dailyRoutine": { ... },
      "locationPreference": "indoor",
      "weeklyActivities": ["gym", "work"]
    },
    "recentRecommendations": [{"name": "...", "type": "..."}],
    "currentTime": "2026-05-16T08:00:00Z",
    "dayOfWeek": "Saturday"
  }

Response:
  {
    "content": {
      "morning": { "title": "...", "body": "...", "data": { "deepLink": "wuloye://schedule" } },
      "afternoon": { ... },
      "evening": { ... }
    }
  }
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from llm import generate_recommendation_reason, is_llm_enabled

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Notifications"])

# ─── Request / Response models ────────────────────────────────────────────────

class NotificationGenerateRequest(BaseModel):
    uid: str = ""
    type: str = "all"  # morning | afternoon | evening | all
    profile: dict[str, Any] = {}
    recentRecommendations: list[dict[str, Any]] = []
    currentTime: Optional[str] = None
    dayOfWeek: Optional[str] = None


class NotificationContent(BaseModel):
    title: str
    body: str
    data: dict[str, Any] = {}


class NotificationGenerateResponse(BaseModel):
    content: dict[str, Any]


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/notifications/generate", response_model=NotificationGenerateResponse)
async def generate_notifications(req: NotificationGenerateRequest) -> NotificationGenerateResponse:
    """Generate personalized AI notification content."""

    profile = req.profile
    recs = req.recentRecommendations
    notification_type = req.type
    day = req.dayOfWeek or _current_day()

    now = datetime.fromisoformat(req.currentTime) if req.currentTime else datetime.now()
    is_weekend = now.weekday() >= 5  # Saturday = 5, Sunday = 6

    # Build context dict for LLM prompt
    context = _build_context(profile, recs, day, is_weekend, now)

    content = {}

    if notification_type in ("morning", "all"):
        content["morning"] = _generate_morning(profile, context, is_weekend)

    if notification_type in ("afternoon", "all"):
        content["afternoon"] = _generate_afternoon(profile, context, is_weekend)

    if notification_type in ("evening", "all"):
        content["evening"] = _generate_evening(profile, context, is_weekend)

    if notification_type == "dynamic":
        content["dynamic"] = _generate_dynamic(profile, recs, context)

    return NotificationGenerateResponse(content=content)


# ─── Content generators ───────────────────────────────────────────────────────

def _generate_morning(
    profile: dict, context: dict, is_weekend: bool
) -> dict:
    name = _first_name(profile.get("name", ""))
    wake_time = profile.get("wakeTime", "07:00")
    morning_activities = (
        profile.get("dailyRoutine", {}).get("morning", {}).get("activities", [])
    )
    interests = profile.get("interests", [])
    religion = profile.get("religion", "")
    day = context["day"]
    rec_names = context["rec_names"]

    # --- LLM path ---
    if is_llm_enabled():
        body = _llm_morning(name, profile, context, is_weekend)
        if body:
            return _build_notif(
                f"Good morning, {name}" if name else "Good morning",
                body,
                "wuloye://schedule",
                "morning",
            )

    # --- Template fallback ---
    if is_weekend:
        weekend_pref = profile.get("weekendPreference", "")
        if weekend_pref == "outdoor":
            body = f"Happy {day}, {name}. A great outdoor activity matches your weekend style." if name else f"Happy {day}. A great outdoor activity awaits."
        elif weekend_pref == "indoor":
            body = f"Happy {day}, {name}. Your AI found a cozy indoor spot for your weekend." if name else f"Happy {day}. A cozy spot awaits."
        else:
            body = f"Happy {day}. Your AI has a relaxing weekend plan ready for you."
    elif morning_activities:
        act = morning_activities[0]
        body = f"Your {act} is planned this morning{', ' + name if name else ''}. Today's full schedule is ready."
    elif "coffee" in interests or "cafe" in interests:
        body = f"Your morning coffee spot is quieter today{', ' + name if name else ''}. Tap to see your plan."
    elif rec_names:
        top = rec_names[0]
        body = f"We found {top} on your path today. Tap to see your full morning plan."
    else:
        body = f"Your personalized {day} plan is ready{', ' + name if name else ''}. Tap to see what's ahead."

    if religion in ("orthodox", "protestant", "catholic") and day in ("Sunday",):
        body = f"Happy Sunday, {name}. A church nearby matches your faith." if name else "Happy Sunday. A church nearby matches your faith."

    return _build_notif(
        f"Good morning{', ' + name if name else ''}",
        body,
        "wuloye://schedule",
        "morning",
    )


def _generate_afternoon(
    profile: dict, context: dict, is_weekend: bool
) -> dict:
    name = _first_name(profile.get("name", ""))
    budget = profile.get("budgetRange", "medium")
    lunch_type = profile.get("dailyRoutine", {}).get("afternoon", {}).get("lunchType", "")
    rec_names = context["rec_names"]
    day = context["day"]

    # --- LLM path ---
    if is_llm_enabled():
        body = _llm_afternoon(name, profile, context, is_weekend)
        if body:
            return _build_notif(
                f"Midday, {name}" if name else "Midday check-in",
                body,
                "wuloye://discover?category=restaurant",
                "afternoon",
            )

    # --- Template fallback ---
    if is_weekend:
        body = f"You have free time today{', ' + name if name else ''}. A spot matching your vibe is close by."
    elif budget == "low":
        body = f"A budget-friendly lunch option matching your taste is nearby{', ' + name if name else ''}."
    elif lunch_type == "homemade":
        body = f"Midday check-in{', ' + name if name else ''}. A nearby activity fits your afternoon routine."
    elif rec_names:
        top = rec_names[0]
        body = f"{top} is a great lunch option that matches your routine today."
    else:
        body = f"A great lunch spot matching your routine is nearby{', ' + name if name else ''}. Tap to explore."

    return _build_notif(
        f"Midday{', ' + name if name else ''}",
        body,
        "wuloye://discover?category=restaurant",
        "afternoon",
    )


def _generate_evening(
    profile: dict, context: dict, is_weekend: bool
) -> dict:
    name = _first_name(profile.get("name", ""))
    event_interests = profile.get("eventInterests", [])
    religion = profile.get("religion", "")
    weekend_pref = profile.get("weekendPreference", "")
    rec_names = context["rec_names"]
    day = context["day"]

    # --- LLM path ---
    if is_llm_enabled():
        body = _llm_evening(name, profile, context, is_weekend)
        if body:
            return _build_notif(
                f"Good evening, {name}" if name else "Good evening",
                body,
                "wuloye://home",
                "evening",
            )

    # --- Template fallback ---
    if (
        "religious" in event_interests
        and religion
        and religion not in ("prefer_not_to_say", "other")
    ):
        body = f"A {religion} event is happening near you tonight{', ' + name if name else ''}."
    elif "tech" in event_interests:
        body = f"A tech event is happening nearby tonight. Tap to see details."
    elif "social" in event_interests:
        body = f"A social gathering matching your interests is nearby tonight."
    elif is_weekend and weekend_pref:
        body = f"Weekend evening sorted{', ' + name if name else ''}. A great {weekend_pref} spot is ready for you."
    elif rec_names:
        top = rec_names[0]
        body = f"{top} is a great evening option nearby. Tap to explore."
    else:
        body = f"Tomorrow is prepped{', ' + name if name else ''}. A calm evening suggestion from your AI is ready."

    return _build_notif(
        f"Good evening{', ' + name if name else ''}",
        body,
        "wuloye://home",
        "evening",
    )


def _generate_dynamic(
    profile: dict, recs: list, context: dict
) -> dict:
    name = _first_name(profile.get("name", ""))
    rec_names = context["rec_names"]

    if rec_names:
        place = rec_names[0]
        title = "Nearby for you"
        body = f"{place} matches your usual preferences. It's a great time to visit."
    else:
        title = "Personalized pick"
        body = f"Your AI found something new nearby that fits your lifestyle{', ' + name if name else ''}."

    return _build_notif(title, body, "wuloye://discover", "dynamic")


# ─── LLM helpers ─────────────────────────────────────────────────────────────

def _llm_morning(name: str, profile: dict, context: dict, is_weekend: bool) -> Optional[str]:
    try:
        from llm.openai_client import _get_client, _MODEL, _TIMEOUT_S, _MAX_TOKENS
        client = _get_client()
        if client is None:
            return None

        interests_str = ", ".join(profile.get("interests", [])[:5]) or "general"
        routine_str = _summarize_routine(profile)
        budget = profile.get("budgetRange", "medium")
        day = context["day"]
        rec_names_str = ", ".join(context["rec_names"][:3]) or "none"
        weekend_note = " It is a weekend day." if is_weekend else ""

        prompt = (
            f"You are a warm, intelligent lifestyle assistant for an Ethiopian app called Wuloye. "
            f"Write a single short (max 120 characters) notification body for the morning check-in. "
            f"User's first name: {name or 'the user'}. "
            f"Day: {day}.{weekend_note} "
            f"Budget: {budget}. Interests: {interests_str}. "
            f"Morning routine: {routine_str}. "
            f"Top nearby recommendations: {rec_names_str}. "
            f"The message must feel personal, calm, and contextual — not generic. "
            f"Do NOT include a greeting like 'Good morning' — that is the title. "
            f"Output ONLY the notification body text, nothing else."
        )

        resp = client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
            temperature=0.7,
            timeout=_TIMEOUT_S,
        )
        result = resp.choices[0].message.content.strip().strip('"\'')
        return result if len(result) > 10 else None
    except Exception as e:
        logger.debug(f"[notifications] LLM morning generation failed: {e}")
        return None


def _llm_afternoon(name: str, profile: dict, context: dict, is_weekend: bool) -> Optional[str]:
    try:
        from llm.openai_client import _get_client, _MODEL, _TIMEOUT_S
        client = _get_client()
        if client is None:
            return None

        lunch_type = profile.get("dailyRoutine", {}).get("afternoon", {}).get("lunchType", "restaurant")
        budget = profile.get("budgetRange", "medium")
        rec_names_str = ", ".join(context["rec_names"][:3]) or "none"
        weekend_note = " It is a weekend day." if is_weekend else ""

        prompt = (
            f"You are a lifestyle assistant for an Ethiopian app called Wuloye. "
            f"Write a single short (max 120 chars) midday notification body. "
            f"User's first name: {name or 'the user'}.{weekend_note} "
            f"Budget: {budget}. Preferred lunch: {lunch_type}. "
            f"Top nearby: {rec_names_str}. "
            f"Be personal, specific, calm. Do NOT include 'Midday' or a greeting — that is the title. "
            f"Output ONLY the notification body text."
        )

        resp = client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
            temperature=0.7,
            timeout=_TIMEOUT_S,
        )
        result = resp.choices[0].message.content.strip().strip('"\'')
        return result if len(result) > 10 else None
    except Exception as e:
        logger.debug(f"[notifications] LLM afternoon generation failed: {e}")
        return None


def _llm_evening(name: str, profile: dict, context: dict, is_weekend: bool) -> Optional[str]:
    try:
        from llm.openai_client import _get_client, _MODEL, _TIMEOUT_S
        client = _get_client()
        if client is None:
            return None

        event_interests = ", ".join(profile.get("eventInterests", [])[:4]) or "general"
        rec_names_str = ", ".join(context["rec_names"][:3]) or "none"
        weekend_note = " It is a weekend day." if is_weekend else ""

        prompt = (
            f"You are a lifestyle assistant for an Ethiopian app called Wuloye. "
            f"Write a single short (max 120 chars) evening notification body. "
            f"User's first name: {name or 'the user'}.{weekend_note} "
            f"Event interests: {event_interests}. Top nearby: {rec_names_str}. "
            f"The tone should be calm, relaxing, and personal — not pushy. "
            f"Do NOT include 'Good evening' — that is the title. "
            f"Output ONLY the notification body text."
        )

        resp = client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
            temperature=0.7,
            timeout=_TIMEOUT_S,
        )
        result = resp.choices[0].message.content.strip().strip('"\'')
        return result if len(result) > 10 else None
    except Exception as e:
        logger.debug(f"[notifications] LLM evening generation failed: {e}")
        return None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_notif(title: str, body: str, deep_link: str, notif_type: str) -> dict:
    return {
        "title": title,
        "body": body,
        "data": {
            "deepLink": deep_link,
            "type": notif_type,
        },
    }


def _first_name(full_name: str) -> str:
    if not full_name:
        return ""
    return full_name.strip().split()[0]


def _current_day() -> str:
    return datetime.now().strftime("%A")


def _build_context(
    profile: dict,
    recs: list,
    day: str,
    is_weekend: bool,
    now: datetime,
) -> dict:
    rec_names = [r.get("name", "") for r in recs if r.get("name")]
    return {
        "day": day,
        "is_weekend": is_weekend,
        "hour": now.hour,
        "rec_names": rec_names,
    }


def _summarize_routine(profile: dict) -> str:
    routine = profile.get("dailyRoutine", {})
    morning = routine.get("morning", {})
    activities = morning.get("activities", [])
    breakfast = morning.get("breakfastType", "")
    parts = []
    if activities:
        parts.append(", ".join(activities[:3]))
    if breakfast:
        parts.append(f"{breakfast} breakfast")
    return "; ".join(parts) if parts else "flexible"
