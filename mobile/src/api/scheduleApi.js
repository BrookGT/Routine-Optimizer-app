import apiClient from "./client";

/**
 * GET /api/ai/schedule
 *
 * Returns a personalized AI daily schedule split into four periods:
 *   { morning: [...], afternoon: [...], evening: [...], night: [...] }
 *
 * Each slot contains:
 *   { id, period, time, title, activityType, icon, color, duration,
 *     source, reason, badges, place: { ... } | null }
 *
 * @param {{ lat?: number, lng?: number, radius?: number }} params
 */
export async function getAiSchedule(params = {}) {
    const { data } = await apiClient.get("/ai/schedule", { params });
    return data;
}
