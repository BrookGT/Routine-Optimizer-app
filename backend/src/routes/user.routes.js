/**
 * routes/user.routes.js — User-related routes
 *
 * Mounted in app.js at /api so that route paths below produce:
 *
 *   GET  /api/profile  → return (or create) the authenticated user's profile
 *
 * Future user-management routes (/api/users, /api/users/:id, etc.) will be
 * added here as new sprints introduce admin/CRUD features.
 *
 * All routes below that touch user data are protected by the authenticate
 * middleware — unauthenticated requests are rejected with 401 before
 * reaching the controller.
 */

import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { getProfile, updateProfile, checkUsername } from "../controllers/user.controller.js";

const router = Router();

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * GET /api/profile
 *
 * Protected — requires a valid Firebase ID token in the Authorization header.
 * Returns the caller's Firestore profile document, creating it on first login.
 */
router.get("/profile", authenticate, getProfile);

/**
 * PUT /api/profile
 *
 * Protected — updates mutable fields on the caller's profile document.
 * Updatable fields: name, interests, budgetRange, locationPreference,
 * sleepTime, wakeTime, weeklyActivities, mealPreferences, weeklyBudget.
 */
router.put("/profile", authenticate, updateProfile);

/**
 * GET /api/profile/username/check?username=xxx
 *
 * Checks if a username is available without writing anything.
 * Returns { data: { available: boolean } }.
 */
router.get("/profile/username/check", authenticate, checkUsername);

// ─── Future user-management routes (Sprint 2+) ───────────────────────────────
// router.get("/users",      authenticate, listUsers);
// router.get("/users/:uid", authenticate, getUserById);
// router.patch("/users/:uid", authenticate, updateUser);

export default router;
