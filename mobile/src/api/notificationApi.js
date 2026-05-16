/**
 * notificationApi.js — Notification API client
 *
 * Wraps all backend /api/notifications endpoints.
 */

import { apiClient } from "./client";

/**
 * Fetches the user's notification preferences from the backend.
 */
export async function getNotificationPreferences() {
    const res = await apiClient.get("/notifications/preferences");
    return res.data?.data ?? null;
}

/**
 * Updates the user's notification preferences on the backend.
 */
export async function updateNotificationPreferences(prefs) {
    const res = await apiClient.put("/notifications/preferences", prefs);
    return res.data?.data ?? null;
}

/**
 * Asks the backend to generate AI notification content for a given type.
 * type: "morning" | "afternoon" | "evening" | "dynamic" | "all"
 */
export async function generateAINotificationContent(type = "all", context = {}) {
    const res = await apiClient.get("/notifications/generate", {
        params: { type, ...context },
    });
    return res.data?.data ?? null;
}

/**
 * Logs a notification interaction (received / tapped / dismissed).
 */
export async function logNotificationEvent(notificationId, action, meta = {}) {
    const res = await apiClient.post("/notifications/interaction", {
        notificationId,
        action,
        timestamp: new Date().toISOString(),
        ...meta,
    });
    return res.data;
}

/**
 * Fetches the user's notification history.
 */
export async function getNotificationHistory(limit = 20) {
    const res = await apiClient.get("/notifications/history", {
        params: { limit },
    });
    return res.data?.data ?? [];
}
