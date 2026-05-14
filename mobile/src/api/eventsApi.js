import apiClient from "./client";

/**
 * Fetch all events with optional filters and location for proximity sorting.
 *
 * @param {object} params
 * @param {string} [params.category]  — filter by category
 * @param {string} [params.dateFrom]  — ISO date lower bound
 * @param {string} [params.dateTo]    — ISO date upper bound
 * @param {string} [params.location]  — partial location match
 * @param {number} [params.limit]     — max results (default 50)
 * @param {number} [params.lat]       — user latitude for proximity sort
 * @param {number} [params.lng]       — user longitude for proximity sort
 */
export async function getEvents(params = {}) {
    const { data } = await apiClient.get("/events", { params });
    return data;
}

/**
 * Fetch AI-personalised events for the current authenticated user.
 * Requires a valid Firebase ID token (attached automatically by the client).
 */
export async function getRecommendedEvents() {
    const { data } = await apiClient.get("/events/recommended");
    return data;
}

/**
 * Fetch a single event by its Firestore document ID.
 *
 * @param {string} eventId
 */
export async function getEventById(eventId) {
    const { data } = await apiClient.get(`/events/${encodeURIComponent(eventId)}`);
    return data?.event ?? data;
}
