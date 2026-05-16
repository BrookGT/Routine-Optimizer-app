/**
 * controllers/user.controller.js — User profile controller
 *
 * Responsibility: handle HTTP request/response concerns for user routes.
 * No Firestore logic lives here — all data operations are delegated to
 * user.service.js. Controllers only orchestrate and respond.
 */

import { findOrCreateUser, updateUserProfile, isUsernameAvailable } from "../services/user.service.js";

/**
 * GET /api/profile
 *
 * Returns the authenticated user's profile document.
 * If the user has never logged in before, their document is created
 * automatically using the data from their Firebase ID token.
 *
 * Requires: authenticate middleware (req.user must be populated)
 *
 * Responses:
 *   200 — { success: true, data: { uid, email, name, createdAt }, message }
 *   500 — forwarded to the global error handler via next(error)
 *
 * @type {import("express").RequestHandler}
 */
export const getProfile = async (req, res, next) => {
  try {
    // req.user is the decoded Firebase ID token set by auth.middleware.js
    const user = await findOrCreateUser(req.user);

    return res.status(200).json({
      success: true,
      data: user,
      message: "Profile retrieved successfully",
    });
  } catch (error) {
    // Delegate to the centralised error handler in errorHandler.js
    next(error);
  }
};

/**
 * PUT /api/profile
 *
 * Updates mutable fields of the authenticated user's profile.
 * uid is always taken from the verified token — never from the request body.
 *
 * Updatable fields:
 *   name               {string}
 *   interests          {string[]}
 *   budgetRange        {string}
 *   locationPreference {string}
 *   sleepTime          {string}  — "HH:mm"
 *   wakeTime           {string}  — "HH:mm"
 *   weeklyActivities   {string[]}
 *   mealPreferences    {string[]}
 *   weeklyBudget       {number}
 *
 * Responses:
 *   200 — { success: true, data: <updatedProfile>, message }
 *   400 — no valid updatable fields were provided
 *   404 — user profile document not found (forwarded to error handler)
 *   500 — forwarded to the global error handler via next(error)
 *
 * @type {import("express").RequestHandler}
 */

/** Fields the client is allowed to update via PUT /api/profile. */
const UPDATABLE_PROFILE_FIELDS = [
    /**
     * Legacy display name — kept for backward compatibility with existing users.
     * New onboarding no longer collects real names; `username` is the primary identifier.
     */
    "name",
    /** Public username handle — e.g. "abebe_biruk". Uniqueness enforced by checkUsername. */
    "username",
    "interests",
    "budgetRange",
    "locationPreference",
    /** "HH:mm" 24h strings */
    "sleepTime",
    "wakeTime",
    /** Lifestyle tags: gym, work, study, etc. (includes custom user-defined activities) */
    "weeklyActivities",
    /** Meal style tags for personalization */
    "mealPreferences",
    /** Typical weekly spend for outings (number; client may send currency-agnostic units) */
    "weeklyBudget",
    // ── Onboarding v2 fields ──────────────────────────────────────────────────
    /** User's religion preference — drives denomination filtering for religious venues */
    "religion",
    /**
     * User's gender/sex — optional, helps personalize activity and event recommendations.
     * Values: "male" | "female" | "non_binary" | "prefer_not_to_say" | ""
     */
    "gender",
    /** { morning: { start, end }, afternoon: { start, end } } — work schedule */
    "workingHours",
    /** Structured daily routine from the onboarding routine builder */
    "dailyRoutine",
    /** Weekend activity preference tags */
    "weekendPreference",
    /** Event category interests (music, sports, culture, etc.) */
    "eventInterests",
];

export const updateProfile = async (req, res, next) => {
  try {
    const updates = UPDATABLE_PROFILE_FIELDS.reduce((acc, field) => {
      if (req.body[field] !== undefined) acc[field] = req.body[field];
      return acc;
    }, {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `No updatable fields provided. Allowed fields: ${UPDATABLE_PROFILE_FIELDS.join(", ")}`,
      });
    }

    // If username is being updated, validate format and uniqueness.
    if (updates.username !== undefined) {
      const username = String(updates.username).trim().toLowerCase();
      const valid = /^[a-z][a-z0-9_]{2,19}$/.test(username);
      if (!valid) {
        return res.status(400).json({
          success: false,
          data: null,
          message:
            "Username must be 3–20 characters, start with a letter, and contain only lowercase letters, numbers, or underscores.",
        });
      }
      const available = await isUsernameAvailable(username, req.user.uid);
      if (!available) {
        return res.status(409).json({
          success: false,
          data: null,
          message: "That username is already taken.",
        });
      }
      updates.username = username;
    }

    const updated = await updateUserProfile(req.user.uid, updates);

    return res.status(200).json({
      success: true,
      data: updated,
      message: "Profile updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/profile/username/check?username=xxx
 *
 * Public-ish endpoint (still requires auth) that checks whether a username
 * is available without committing any writes.
 *
 * @type {import("express").RequestHandler}
 */
export const checkUsername = async (req, res, next) => {
  try {
    const raw = String(req.query.username ?? "")
      .trim()
      .toLowerCase();

    const valid = /^[a-z][a-z0-9_]{2,19}$/.test(raw);
    if (!valid) {
      return res.status(200).json({
        success: true,
        data: { available: false, reason: "invalid_format" },
        message: "Username format is invalid.",
      });
    }

    const available = await isUsernameAvailable(raw, req.user.uid);
    return res.status(200).json({
      success: true,
      data: { available },
      message: available ? "Username is available." : "Username is taken.",
    });
  } catch (error) {
    next(error);
  }
};
