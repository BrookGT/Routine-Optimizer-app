/**
 * event.routes.js — Route definitions for the events resource.
 *
 * Public (no auth):
 *   GET  /api/events             — list events with optional filters
 *   GET  /api/events/:id         — single event by ID
 *
 * Authenticated:
 *   GET  /api/events/recommended — AI-personalised list for the current user
 *
 * Admin only:
 *   GET    /api/events/stats       — total event count
 *   PATCH  /api/events/:id         — edit event fields
 *   DELETE /api/events/:id         — delete event
 *   PATCH  /api/events/:id/featured — toggle featured flag
 */

import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import { authLimiter }   from "../middleware/rateLimiter.js";
import {
  getEventsHandler,
  getRecommendedEventsHandler,
  getEventsStatsHandler,
  getEventByIdHandler,
  updateEventHandler,
  deleteEventHandler,
  setFeaturedHandler,
} from "../controllers/event.controller.js";

const router = Router();

// ── Public routes ─────────────────────────────────────────────────────────────
router.get("/", getEventsHandler);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.get("/recommended", authLimiter, authenticate, getRecommendedEventsHandler);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get("/stats", authenticate, requireAdmin, getEventsStatsHandler);
router.patch("/:id", authenticate, requireAdmin, updateEventHandler);
router.delete("/:id", authenticate, requireAdmin, deleteEventHandler);
router.patch("/:id/featured", authenticate, requireAdmin, setFeaturedHandler);

// ── Single event (public, after named routes to avoid route conflicts) ─────────
router.get("/:id", getEventByIdHandler);

export default router;
