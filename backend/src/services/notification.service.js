/**
 * services/notification.service.js — Notification System Data Layer
 *
 * Manages:
 *   - Firestore collection: notificationPreferences/{uid}
 *   - Firestore collection: notificationHistory/{uid}/events/{notifId}
 *   - AI notification content generation (delegates to ai-service)
 *   - Notification analytics (open rate, engagement, timing optimization)
 */

import { db } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { getUserById } from "./user.service.js";
import { getRecommendations } from "./recommendation.service.js";
import { logger } from "../utils/logger.js";

// ─── Collections ──────────────────────────────────────────────────────────────

const PREFS_COLLECTION = "notificationPreferences";
const HISTORY_COLLECTION = "notificationHistory";

// ─── Default preferences ──────────────────────────────────────────────────────

const DEFAULT_PREFS = {
    enabled: true,
    morningEnabled: true,
    morningTime: "08:00",
    afternoonEnabled: true,
    afternoonTime: "12:30",
    eveningEnabled: true,
    eveningTime: "20:00",
    dynamicEnabled: true,
    eventReminders: true,
    recommendationReminders: true,
    sound: true,
    vibration: true,
    updatedAt: null,
};

// ─── Preference CRUD ──────────────────────────────────────────────────────────

/**
 * Gets notification preferences for a user.
 * If no document exists, returns defaults merged with onboarding data.
 */
export async function getNotificationPreferences(uid) {
    const docRef = db.collection(PREFS_COLLECTION).doc(uid);
    const snap = await docRef.get();

    if (snap.exists) {
        return snap.data();
    }

    // Bootstrap defaults from user profile
    const profile = await getUserById(uid).catch(() => null);
    const onboardingDefaults = buildOnboardingDefaults(profile);
    const defaults = { ...DEFAULT_PREFS, ...onboardingDefaults, uid };

    // Persist so subsequent reads are fast
    await docRef.set(defaults);
    return defaults;
}

/**
 * Updates notification preferences for a user (partial merge).
 */
export async function updateNotificationPreferences(uid, updates) {
    const ALLOWED_FIELDS = [
        "enabled",
        "morningEnabled",
        "morningTime",
        "afternoonEnabled",
        "afternoonTime",
        "eveningEnabled",
        "eveningTime",
        "dynamicEnabled",
        "eventReminders",
        "recommendationReminders",
        "sound",
        "vibration",
    ];

    const sanitized = {};
    for (const field of ALLOWED_FIELDS) {
        if (updates[field] !== undefined) {
            sanitized[field] = updates[field];
        }
    }
    sanitized.updatedAt = new Date().toISOString();

    const docRef = db.collection(PREFS_COLLECTION).doc(uid);
    await docRef.set(sanitized, { merge: true });

    const updated = await docRef.get();
    return updated.data();
}

/**
 * Derives sensible time defaults from onboarding profile fields.
 */
function buildOnboardingDefaults(profile) {
    if (!profile) return {};

    const defaults = {};

    if (profile.wakeTime) {
        defaults.morningTime = addMinutesToTime(profile.wakeTime, 30);
    }

    const lunchTime = profile.dailyRoutine?.afternoon?.lunchTime;
    if (lunchTime) {
        defaults.afternoonTime = lunchTime;
    }

    if (profile.sleepTime) {
        defaults.eveningTime = subtractMinutesFromTime(profile.sleepTime, 60);
    }

    return defaults;
}

// ─── Notification history ─────────────────────────────────────────────────────

/**
 * Logs a sent or received notification event to Firestore.
 */
export async function logNotificationEvent(uid, event) {
    const {
        notificationId,
        action, // "sent" | "received" | "tapped" | "dismissed"
        type,   // "morning" | "afternoon" | "evening" | "dynamic"
        title,
        body,
        deepLink,
        timestamp = new Date().toISOString(),
    } = event;

    const histRef = db
        .collection(HISTORY_COLLECTION)
        .doc(uid)
        .collection("events")
        .doc(notificationId ?? db.collection("_").doc().id);

    await histRef.set({
        notificationId,
        action,
        type,
        title,
        body,
        deepLink,
        timestamp,
        uid,
    });
}

/**
 * Returns recent notification history for a user.
 */
export async function getNotificationHistory(uid, limit = 20) {
    const snap = await db
        .collection(HISTORY_COLLECTION)
        .doc(uid)
        .collection("events")
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();

    return snap.docs.map((d) => d.data());
}

/**
 * Logs a notification interaction (tapped, dismissed, etc.)
 * and computes engagement analytics.
 */
export async function logNotificationInteraction(uid, data) {
    const { notificationId, action, type } = data;

    await logNotificationEvent(uid, {
        notificationId,
        action,
        type,
        timestamp: new Date().toISOString(),
    });

    // Track engagement analytics on the preferences doc
    if (action === "tapped") {
        await db
            .collection(PREFS_COLLECTION)
            .doc(uid)
            .set(
                {
                    [`analytics.taps.${type ?? "unknown"}`]:
                        incrementField(1),
                    "analytics.lastTappedAt": new Date().toISOString(),
                },
                { merge: true },
            );
    }
}

// ─── AI notification content generation ──────────────────────────────────────

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL ?? "http://localhost:8000";

/**
 * Calls the Python AI service to generate personalized notification content.
 * Falls back to template content if the AI service is unreachable.
 *
 * @param {string} uid
 * @param {string} type — "morning" | "afternoon" | "evening" | "all"
 * @returns {object} { morning?, afternoon?, evening?, dynamic? }
 */
export async function generateNotificationContent(uid, type = "all") {
    const profile = await getUserById(uid).catch(() => null);
    if (!profile) {
        return buildTemplateContent(null, type);
    }

    // Fetch recent recommendations to enrich the AI prompt
    // getRecommendations(userId, debug, limit, userLocation, fastMode)
    let recentRecs = [];
    try {
        const recResult = await getRecommendations(uid, false, 5, null, true);
        recentRecs = (recResult.recommendations ?? []).slice(0, 5);
    } catch {
        // Non-critical — notifications still generate without recommendations
    }

    // Build the request payload for the AI service
    const payload = {
        uid,
        type,
        profile: {
            name: profile.name,
            wakeTime: profile.wakeTime,
            sleepTime: profile.sleepTime,
            budgetRange: profile.budgetRange,
            weeklyBudget: profile.weeklyBudget,
            interests: profile.interests,
            religion: profile.religion,
            weekendPreference: profile.weekendPreference,
            eventInterests: profile.eventInterests,
            mealPreferences: profile.mealPreferences,
            dailyRoutine: profile.dailyRoutine,
            locationPreference: profile.locationPreference,
            weeklyActivities: profile.weeklyActivities,
        },
        recentRecommendations: recentRecs.map((r) => ({
            name: r.name,
            type: r.type,
            category: r.category,
        })),
        currentTime: new Date().toISOString(),
        dayOfWeek: new Date().toLocaleDateString("en-US", {
            weekday: "long",
        }),
    };

    try {
        const res = await fetch(`${AI_SERVICE_URL}/notifications/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) throw new Error(`AI service returned ${res.status}`);

        const json = await res.json();
        return json.content ?? buildTemplateContent(profile, type);
    } catch (err) {
        logger.warn(
            `[notification.service] AI content generation failed: ${err.message} — using templates`,
        );
        return buildTemplateContent(profile, type);
    }
}

// ─── Template content (fallback) ─────────────────────────────────────────────

function buildTemplateContent(profile, type) {
    const name = profile?.name?.split(" ")[0] ?? "there";
    const now = new Date();
    const hour = now.getHours();
    const day = now.toLocaleDateString("en-US", { weekday: "long" });
    const isWeekend = [0, 6].includes(now.getDay());

    const morning = buildMorningTemplate(profile, name, day, isWeekend);
    const afternoon = buildAfternoonTemplate(profile, name, isWeekend);
    const evening = buildEveningTemplate(profile, name, isWeekend);

    if (type === "morning") return morning;
    if (type === "afternoon") return afternoon;
    if (type === "evening") return evening;

    return { morning, afternoon, evening };
}

function buildMorningTemplate(profile, name, day, isWeekend) {
    const activities = profile?.dailyRoutine?.morning?.activities ?? [];
    const interests = profile?.interests ?? [];

    let body;
    if (isWeekend && profile?.weekendPreference) {
        body = `Happy ${day}, ${name}. Your AI has a great ${profile.weekendPreference} plan ready.`;
    } else if (activities.length > 0) {
        const act = activities[0];
        body = `Your ${act} is scheduled this morning. Tap to see today's full plan.`;
    } else if (interests.includes("coffee") || interests.includes("cafe")) {
        body = `Your morning coffee spot is quieter today. Tap for your personalized plan.`;
    } else {
        body = `${day} is looking great. Your AI has your day organized. Tap to see it.`;
    }

    return {
        title: `Good morning, ${name}`,
        body,
        data: { deepLink: "wuloye://schedule", type: "morning" },
    };
}

function buildAfternoonTemplate(profile, name, isWeekend) {
    const budget = profile?.budgetRange ?? "medium";
    const lunchType = profile?.dailyRoutine?.afternoon?.lunchType;

    let body;
    if (isWeekend) {
        body = "You have free time today. A spot matching your vibe is nearby.";
    } else if (budget === "low") {
        body = "A budget-friendly lunch option matching your taste is close by.";
    } else if (lunchType === "homemade") {
        body = "Midday check-in — a nearby activity fits your afternoon schedule.";
    } else {
        body = "A great lunch spot matching your routine is nearby. Tap to explore.";
    }

    return {
        title: `Midday, ${name}`,
        body,
        data: { deepLink: "wuloye://discover?category=restaurant", type: "afternoon" },
    };
}

function buildEveningTemplate(profile, name, isWeekend) {
    const eventInterests = profile?.eventInterests ?? [];
    const religion = profile?.religion;

    let body;
    if (eventInterests.includes("religious") && religion && religion !== "prefer_not_to_say") {
        body = `A ${religion} event is happening near you tonight.`;
    } else if (eventInterests.length > 0) {
        body = `An event matching your interests is happening tonight. Tap to see it.`;
    } else if (isWeekend) {
        body = "It's the weekend. Your AI found something relaxing nearby for the evening.";
    } else {
        body = "Tomorrow is prepped. Your AI has a calm evening suggestion ready.";
    }

    return {
        title: `Good evening, ${name}`,
        body,
        data: { deepLink: "wuloye://home", type: "evening" },
    };
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function addMinutesToTime(timeStr, mins) {
    const [h, m] = timeStr.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + mins, 0, 0);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function subtractMinutesFromTime(timeStr, mins) {
    return addMinutesToTime(timeStr, -mins);
}

// ─── Firestore FieldValue.increment ──────────────────────────────────────────

function incrementField(n) {
    return FieldValue.increment(n);
}
