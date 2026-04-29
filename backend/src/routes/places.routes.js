/**
 * places.routes.js — Routes for the /api/places resource.
 *
 * Mounted at /api/places in app.js.
 * Both routes require a valid Firebase ID token.
 */

import { Router }              from "express";
import { authenticate }        from "../middleware/auth.middleware.js";
import { authLimiter }         from "../middleware/rateLimiter.js";
import {
  getPlaceHandler,
  getPlacePhotoHandler,
} from "../controllers/places.controller.js";

const router = Router();

// GET /api/places/:id — full place details (Google → Firestore fallback)
router.get("/:id", authLimiter, authenticate, getPlaceHandler);

// GET /api/places/:id/photo?ref=<ref>&w=<width> — photo proxy (key stays server-side)
router.get("/:id/photo", authLimiter, authenticate, getPlacePhotoHandler);

export default router;
