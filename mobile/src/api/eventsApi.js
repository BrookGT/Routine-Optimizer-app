import apiClient from "./client";

// ─── Single-event cache (repeat opens + deduped in-flight fetches) ─────────────

const EVENT_CACHE_TTL_MS = 5 * 60 * 1000;
const eventCache = new Map(); // id → { t, payload }
const eventInFlight = new Map();

function eventCacheGet(id) {
    const key = String(id);
    const entry = eventCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.t > EVENT_CACHE_TTL_MS) {
        eventCache.delete(key);
        return null;
    }
    return entry.payload;
}

function eventCacheSet(id, payload) {
    if (!payload || typeof payload !== "object") return;
    eventCache.set(String(id), { t: Date.now(), payload });
}

/**
 * Fire-and-forget: warms cache before navigation completes.
 * @param {string} [eventId]
 */
export function prefetchEventById(eventId) {
    if (!eventId) return;
    getEventById(String(eventId), { bypassCache: false }).catch(() => null);
}

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
 * @param {{ bypassCache?: boolean }} [options]
 */
export async function getEventById(eventId, options = {}) {
    const { bypassCache = false } = options;
    const key = String(eventId);
    if (!key) return null;

    if (!bypassCache) {
        const hit = eventCacheGet(key);
        if (hit) return hit;
    }
    const pending = eventInFlight.get(key);
    if (pending) return pending;

    const p = (async () => {
        try {
            const { data } = await apiClient.get(
                `/events/${encodeURIComponent(key)}`,
                { timeout: 30_000 },
            );
            const ev = data?.event ?? data;
            if (ev && typeof ev === "object") eventCacheSet(key, ev);
            return ev;
        } finally {
            eventInFlight.delete(key);
        }
    })();

    eventInFlight.set(key, p);
    return p;
}
