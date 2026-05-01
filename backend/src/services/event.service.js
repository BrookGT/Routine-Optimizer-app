/**
 * event.service.js — Firestore data layer for the events collection.
 *
 * Event document structure:
 *   id          {string}   — Firestore document ID
 *   title       {string}   — event name
 *   description {string}   — full description
 *   location    {string}   — venue / place name
 *   coordinates {object}   — { lat: number, lng: number }
 *   date        {string}   — ISO 8601 datetime
 *   category    {string}   — "music"|"tech"|"church"|"fitness"|"business"|"food"|"art"|"sports"|"education"|"social"|"other"
 *   image       {string}   — image URL (may be empty)
 *   source_url  {string}   — link to original event page
 *   source      {string}   — scraper that produced this ("alladdisevents"|"whatsupaddis"|"telegram_events_ethiopia")
 *   hash        {string}   — deduplication hash (title+date+location md5)
 *   created_at  {string}   — ISO 8601 of when this was scraped/stored
 */

import { db } from "../config/firebase.js";
import { logger } from "../utils/logger.js";

export const EVENTS_COLLECTION = "events";

export const VALID_CATEGORIES = Object.freeze([
  "music", "tech", "church", "fitness", "business",
  "food", "art", "sports", "education", "social", "other",
]);

// ─── In-process cache ─────────────────────────────────────────────────────────

let _cache = null;
let _cacheTime = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const isCacheValid = () =>
  Array.isArray(_cache) &&
  _cache.length > 0 &&
  _cacheTime !== null &&
  Date.now() - _cacheTime < CACHE_TTL_MS;

const setCache = (events) => {
  _cache = events;
  _cacheTime = Date.now();
};

export const invalidateEventsCache = () => {
  _cache = null;
  _cacheTime = null;
  logger.info("[events] Cache invalidated");
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const docToEvent = (doc) => ({ id: doc.id, ...doc.data() });

// ─── Read helpers ─────────────────────────────────────────────────────────────

/**
 * Get all events, optionally filtered by category, date range, or location.
 *
 * @param {object} filters
 * @param {string}  [filters.category]   — filter by category
 * @param {string}  [filters.dateFrom]   — ISO date lower bound
 * @param {string}  [filters.dateTo]     — ISO date upper bound
 * @param {string}  [filters.location]   — partial location string match
 * @param {number}  [filters.limit=50]   — max results
 * @returns {Promise<object[]>}
 */
export const getAllEvents = async (filters = {}) => {
  const { category, dateFrom, dateTo, location, limit = 50 } = filters;

  // Use cache when no filters applied
  if (!category && !dateFrom && !dateTo && !location && !filters.noCache) {
    if (isCacheValid()) {
      logger.debug(`[events] Cache hit — ${_cache.length} events`);
      return _cache.slice(0, limit);
    }
  }

  let query = db.collection(EVENTS_COLLECTION).orderBy("date", "asc");

  if (category && VALID_CATEGORIES.includes(category)) {
    query = query.where("category", "==", category);
  }

  if (dateFrom) {
    query = query.where("date", ">=", dateFrom);
  }

  if (dateTo) {
    query = query.where("date", "<=", dateTo);
  }

  const snap = await query.limit(limit).get();
  let events = snap.docs.map(docToEvent);

  // Client-side location filter (Firestore doesn't support substring)
  if (location) {
    const loc = location.toLowerCase();
    events = events.filter((e) =>
      (e.location || "").toLowerCase().includes(loc)
    );
  }

  // Update full cache when no filters
  if (!category && !dateFrom && !dateTo && !location) {
    setCache(events);
  }

  return events;
};

/**
 * Get a single event by Firestore document ID.
 *
 * @param {string} eventId
 * @returns {Promise<object|null>}
 */
export const getEventById = async (eventId) => {
  const snap = await db.collection(EVENTS_COLLECTION).doc(eventId).get();
  if (!snap.exists) return null;
  return docToEvent(snap);
};

/**
 * Get upcoming events (date >= now), sorted soonest-first.
 *
 * If nothing matches "upcoming" (empty DB, unparsed past dates, or clock skew),
 * falls back to the most recently scraped rows so Discover → Events is not blank
 * while data exists.
 *
 * @param {number} [limit=20]
 * @returns {Promise<object[]>}
 */
export const getUpcomingEvents = async (limit = 20) => {
  const now = new Date().toISOString();

  let snap = await db
    .collection(EVENTS_COLLECTION)
    .where("date", ">=", now)
    .orderBy("date", "asc")
    .limit(limit)
    .get();

  if (!snap.empty) {
    return snap.docs.map(docToEvent);
  }

  // Fallback 1: newest ingested first (helps when event dates are missing/wrong)
  snap = await db
    .collection(EVENTS_COLLECTION)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();

  if (!snap.empty) {
    logger.info(
      `[events] No upcoming by date>=now — returning ${snap.size} recent by created_at`
    );
    return snap.docs.map(docToEvent);
  }

  // Fallback 2: any events by stored date (newest first)
  try {
    snap = await db
      .collection(EVENTS_COLLECTION)
      .orderBy("date", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(docToEvent);
  } catch (err) {
    logger.warn(`[events] getUpcomingEvents fallback failed: ${err.message}`);
    return [];
  }
};

/**
 * Get events for AI ranking — returns upcoming events with all fields.
 * Used by the recommendation endpoint to fetch candidates.
 *
 * @param {number} [limit=50]
 * @returns {Promise<object[]>}
 */
export const getEventCandidates = async (limit = 50) => {
  return getUpcomingEvents(limit);
};

// ─── Write helpers (admin use) ────────────────────────────────────────────────

/**
 * Update a single event document (admin edit).
 *
 * @param {string} eventId
 * @param {object} updates — partial event fields
 * @returns {Promise<void>}
 */
export const updateEvent = async (eventId, updates) => {
  const ref = db.collection(EVENTS_COLLECTION).doc(eventId);
  await ref.update({ ...updates, updatedAt: new Date().toISOString() });
  invalidateEventsCache();
};

/**
 * Delete a single event document (admin use).
 *
 * @param {string} eventId
 * @returns {Promise<void>}
 */
export const deleteEvent = async (eventId) => {
  await db.collection(EVENTS_COLLECTION).doc(eventId).delete();
  invalidateEventsCache();
};

/**
 * Toggle the `featured` flag on an event (admin use).
 *
 * @param {string} eventId
 * @param {boolean} featured
 * @returns {Promise<void>}
 */
export const setEventFeatured = async (eventId, featured) => {
  await updateEvent(eventId, { featured: Boolean(featured) });
};

/**
 * Count total events in Firestore.
 *
 * @returns {Promise<number>}
 */
export const countEvents = async () => {
  try {
    const agg = await db.collection(EVENTS_COLLECTION).count().get();
    return agg.data().count ?? 0;
  } catch {
    const snap = await db.collection(EVENTS_COLLECTION).limit(10_001).get();
    return snap.size;
  }
};
