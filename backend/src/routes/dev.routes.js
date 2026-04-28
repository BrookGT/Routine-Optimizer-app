/**
 * dev.routes.js — Development-only admin routes.
 *
 * These routes are ONLY mounted in app.js when NODE_ENV !== "production".
 * If the server is started in production mode the entire router is skipped,
 * so no dev tooling surface is exposed in prod regardless of what is imported.
 *
 * Endpoints:
 *   POST /api/dev/seed-places       — seed the places collection if empty
 *   GET  /api/dev/places            — inspect all places currently in Firestore
 *   GET  /api/dev/experiment-metrics — Phase 17: CTR / save / dismiss by variant
 */

import { Router } from "express";
import {
  seedPlacesHandler,
  listPlacesHandler,
  experimentMetricsHandler,
  userLookupHandler,
  interactionsLookupHandler,
  modelStatusHandler,
  systemStatusHandler,
  setExperimentHandler,
  setFallbackHandler,
} from "../controllers/dev.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Middleware guard — belt-and-suspenders protection in addition to the
// conditional mount in app.js.
router.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      data:    null,
      message: "Dev endpoints are disabled in production",
    });
  }
  next();
});

router.use(authenticate, requireAdmin);

// POST /api/dev/seed-places
router.post("/seed-places", seedPlacesHandler);

// POST /api/dev/seed
router.post("/seed", seedPlacesHandler);

// GET  /api/dev/places
router.get("/places", listPlacesHandler);

// GET  /api/dev/experiment-metrics
router.get("/experiment-metrics", experimentMetricsHandler);

// GET /api/dev/user?uid=... or ?email=...
router.get("/user", userLookupHandler);

// GET /api/dev/interactions?uid=... or ?email=...&limit=50
router.get("/interactions", interactionsLookupHandler);

// GET /api/dev/model
router.get("/model", modelStatusHandler);

// GET /api/dev/system
router.get("/system", systemStatusHandler);

// POST /api/dev/system/experiment
router.post("/system/experiment", setExperimentHandler);

// POST /api/dev/system/fallback
router.post("/system/fallback", setFallbackHandler);

export default router;
