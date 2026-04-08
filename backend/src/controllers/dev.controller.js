/**
 * dev.controller.js — Development-only admin tools.
 *
 * These handlers are ONLY mounted when NODE_ENV !== "production".
 * The route guard is enforced in dev.routes.js so even if this controller
 * were accidentally imported in production no data would be mutated.
 */

import { seedPlacesIfEmpty, getAllPlaces } from "../services/place.service.js";
import { SEED_PLACES } from "../data/places.seed.js";
import { aggregateExperimentMetrics, getInteractionsByUser } from "../services/interaction.service.js";
import { getUserByEmail, getUserById } from "../services/user.service.js";

/**
 * POST /api/dev/seed-places
 *
 * Calls seedPlacesIfEmpty() with the canonical seed dataset.
 * Returns how many documents were inserted (or 0 if skipped).
 *
 * Responses:
 *   200 { success: true,  data: { inserted, skipped, existing? }, message }
 *   500 forwarded to the global error handler
 *
 * @type {import("express").RequestHandler}
 */
export const seedPlacesHandler = async (req, res, next) => {
  try {
    const result = await seedPlacesIfEmpty(SEED_PLACES);

    const message = result.skipped
      ? `Seed skipped — collection already has ${result.existing} place(s)`
      : `Seeded ${result.inserted} place(s) successfully`;

    return res.status(200).json({
      success: true,
      data:    result,
      message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dev/places
 *
 * Returns all places currently in Firestore (or from cache).
 * Useful for inspecting the seed result without opening the Firebase Console.
 *
 * @type {import("express").RequestHandler}
 */
export const listPlacesHandler = async (req, res, next) => {
  try {
    const places = await getAllPlaces();

    return res.status(200).json({
      success: true,
      data:    places,
      message: `${places.length} place(s) found`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dev/experiment-metrics?days=7&maxDocs=5000
 *
 * Phase 17 — per-variant CTR, save rate, dismiss rate over recent interactions.
 *
 * @type {import("express").RequestHandler}
 */
export const experimentMetricsHandler = async (req, res, next) => {
  try {
    const daysRaw   = parseInt(String(req.query.days ?? "7"), 10);
    const maxRaw    = parseInt(String(req.query.maxDocs ?? "5000"), 10);
    const days      = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, daysRaw)) : 7;
    const maxDocs   = Number.isFinite(maxRaw) ? Math.min(20000, Math.max(100, maxRaw)) : 5000;

    const data = await aggregateExperimentMetrics(days, maxDocs);

    return res.status(200).json({
      success: true,
      data,
      message: "Experiment metrics aggregated",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dev/user?uid=... or ?email=...
 *
 * Dev-only lookup for a user profile by UID or email.
 */
export const userLookupHandler = async (req, res, next) => {
  try {
    const uid = typeof req.query.uid === "string" ? req.query.uid.trim() : "";
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";

    if (!uid && !email) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Provide uid or email query parameter",
      });
    }

    const user = uid ? await getUserById(uid) : await getUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
      message: "User profile retrieved",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dev/interactions?uid=... or ?email=...&limit=50
 *
 * Dev-only lookup for recent interactions by user.
 */
export const interactionsLookupHandler = async (req, res, next) => {
  try {
    const uid = typeof req.query.uid === "string" ? req.query.uid.trim() : "";
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
    const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

    if (!uid && !email) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Provide uid or email query parameter",
      });
    }

    let targetUid = uid;
    if (!targetUid && email) {
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(404).json({
          success: false,
          data: null,
          message: "User not found",
        });
      }
      targetUid = user.uid;
    }

    const interactions = await getInteractionsByUser(targetUid, limit);

    return res.status(200).json({
      success: true,
      data: interactions,
      message: "Interactions retrieved",
    });
  } catch (error) {
    next(error);
  }
};
