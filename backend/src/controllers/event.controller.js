/**
 * event.controller.js — HTTP handlers for the events resource.
 *
 * Routes (mounted at /api/events):
 *   GET  /                 — list events with optional filters
 *   GET  /recommended      — AI-personalised event list for the authed user
 *   GET  /:id              — single event by ID
 *   PATCH /:id             — admin: edit event fields
 *   DELETE /:id            — admin: delete event
 *   PATCH /:id/featured    — admin: toggle featured flag
 */

import {
  getAllEvents,
  getEventById,
  getEventCandidates,
  updateEvent,
  deleteEvent,
  setEventFeatured,
  countEvents,
} from "../services/event.service.js";
import { getUserById }          from "../services/user.service.js";
import { logger }               from "../utils/logger.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_SERVICE_ENABLED = process.env.AI_SERVICE_ENABLED !== "false";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok = (res, data, status = 200) => res.status(status).json(data);
const fail = (res, status, message) => res.status(status).json({ error: message });

// ─── GET /api/events ──────────────────────────────────────────────────────────

// ─── Haversine distance (km) ─────────────────────────────────────────────────
const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getEventsHandler = async (req, res, next) => {
  try {
    const { category, dateFrom, dateTo, location, limit, lat, lng } = req.query;
    const filters = {
      category: category?.toLowerCase(),
      dateFrom,
      dateTo,
      location,
      limit: limit ? Math.min(parseInt(limit, 10) || 50, 100) : 50,
    };

    let events = await getAllEvents(filters);

    // Sort by proximity when user sends coordinates
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    if (!isNaN(userLat) && !isNaN(userLng)) {
      events = events
        .map((e) => {
          const coords = e.coordinates;
          const distKm =
            coords?.lat && coords?.lng
              ? haversine(userLat, userLng, coords.lat, coords.lng)
              : 9999;
          return { ...e, _distKm: distKm };
        })
        .sort((a, b) => a._distKm - b._distKm)
        .map(({ _distKm, ...e }) => e);
    }

    return ok(res, { events, total: events.length });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/events/recommended ─────────────────────────────────────────────

export const getRecommendedEventsHandler = async (req, res, next) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return fail(res, 401, "Authentication required");

    // Fetch candidate events from Firestore
    const candidates = await getEventCandidates(60);

    if (!candidates.length) {
      return ok(res, { events: [] });
    }

    // Fetch user profile for personalisation
    let userProfile = {
      interests: [],
      typeAffinity: {},
      religion: "",
      weekendPreference: "",
      eventInterests: [],
      dailyRoutine: {},
    };
    try {
      const profile = await getUserById(uid);
      userProfile = {
        interests:        profile?.interests        || [],
        typeAffinity:     profile?.typeAffinity     || {},
        religion:         profile?.religion         || "",
        weekendPreference: profile?.weekendPreference || "",
        eventInterests:   profile?.eventInterests   || [],
        dailyRoutine:     profile?.dailyRoutine     || {},
      };
    } catch (err) {
      logger.warn(`[events/recommended] Could not load profile for ${uid}: ${err.message}`);
    }

    // Ask the AI service to rank events
    if (AI_SERVICE_ENABLED) {
      try {
        const body = {
          user_id: uid,
          user_profile: userProfile,
          events: candidates.map((e) => ({
            id: e.id,
            title: e.title || "",
            category: e.category || "other",
            date: e.date || "",
            location: e.location || "",
            description: e.description || "",
            image: e.image || "",
            source_url: e.source_url || "",
          })),
        };

        const resp = await fetch(`${AI_SERVICE_URL}/events/rank`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });

        if (resp.ok) {
          const { ranked } = await resp.json();
          const top = (ranked || []).slice(0, 10);
          return ok(res, { events: top });
        }
      } catch (aiErr) {
        logger.warn(`[events/recommended] AI service unavailable: ${aiErr.message} — falling back to date sort`);
      }
    }

    // Fallback: sort by soonest date and take top 10
    const sorted = [...candidates].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    ).slice(0, 10);

    return ok(res, { events: sorted });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/events/stats ────────────────────────────────────────────────────

export const getEventsStatsHandler = async (req, res, next) => {
  try {
    const total = await countEvents();
    return ok(res, { total });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/events/:id ──────────────────────────────────────────────────────

export const getEventByIdHandler = async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);
    if (!event) return fail(res, 404, "Event not found");
    return ok(res, { event });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/events/:id ────────────────────────────────────────────────────

export const updateEventHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ["title", "description", "location", "coordinates", "date", "category", "image", "source_url"];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if (!Object.keys(updates).length) {
      return fail(res, 400, "No valid fields to update");
    }

    await updateEvent(id, updates);
    return ok(res, { success: true });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/events/:id ───────────────────────────────────────────────────

export const deleteEventHandler = async (req, res, next) => {
  try {
    await deleteEvent(req.params.id);
    return ok(res, { success: true });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/events/:id/featured ──────────────────────────────────────────

export const setFeaturedHandler = async (req, res, next) => {
  try {
    const featured = req.body?.featured;
    if (typeof featured !== "boolean") {
      return fail(res, 400, "Body must contain { featured: boolean }");
    }
    await setEventFeatured(req.params.id, featured);
    return ok(res, { success: true });
  } catch (err) {
    next(err);
  }
};
