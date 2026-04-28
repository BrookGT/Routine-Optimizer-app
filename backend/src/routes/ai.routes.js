/**
 * routes/ai.routes.js — Backend proxy endpoints for the Python AI microservice.
 *
 * Mounted at /api/ai in app.js.
 *
 * Endpoints:
 *   POST /api/ai/train   — proxy to AI service /train; triggers full model rebuild
 *   POST /api/ai/reset   — proxy to AI service /reset; wipes all AI artefacts
 *   GET  /api/ai/status  — proxy to AI service /model/status
 *
 * All three require a valid Firebase ID token.
 * /reset and /train additionally require the caller to be in ADMIN_EMAILS.
 */

import { Router }    from "express";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import { authLimiter }                from "../middleware/rateLimiter.js";
import {
  triggerAiTrain,
  triggerAiReset,
  getAiStatus,
}                                     from "../controllers/ai.controller.js";

const router = Router();

// POST /api/ai/train  — manual model training trigger (admin)
router.post("/train", authLimiter, authenticate, requireAdmin, triggerAiTrain);

// POST /api/ai/reset  — wipe all AI artefacts (admin)
router.post("/reset", authLimiter, authenticate, requireAdmin, triggerAiReset);

// GET /api/ai/status  — read AI model status (any auth'd user)
router.get("/status", authLimiter, authenticate, getAiStatus);

export default router;
