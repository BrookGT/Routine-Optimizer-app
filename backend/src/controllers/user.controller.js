/**
 * controllers/user.controller.js — User profile controller
 *
 * Responsibility: handle HTTP request/response concerns for user routes.
 * No Firestore logic lives here — all data operations are delegated to
 * user.service.js. Controllers only orchestrate and respond.
 */

import { findOrCreateUser, updateUserProfile } from "../services/user.service.js";

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
    "name",
    "interests",
    "budgetRange",
    "locationPreference",
    /** "HH:mm" 24h strings */
    "sleepTime",
    "wakeTime",
    /** Lifestyle tags: gym, work, study, etc. */
    "weeklyActivities",
    /** Meal style tags for personalization */
    "mealPreferences",
    /** Typical weekly spend for outings (number; client may send currency-agnostic units) */
    "weeklyBudget",
];

export const updateProfile = async (req, res, next) => {
  try {
    // Extract only the allowed fields from the request body.
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
