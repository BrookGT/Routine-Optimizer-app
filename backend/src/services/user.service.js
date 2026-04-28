/**
 * services/user.service.js — User profile data layer
 *
 * Responsibility: all Firestore read/write operations for the users collection.
 * Controllers must never touch Firestore directly — every query lives here.
 *
 * Firestore structure:
 *   Collection : users
 *   Document ID: uid  (Firebase Authentication UID)
 *
 *   Fields:
 *     uid                {string}         — Firebase Auth UID
 *     email              {string|null}    — user's email address
 *     name               {string|null}    — display name from the ID token (if set)
 *     createdAt          {string}         — ISO 8601 timestamp of first login
 *     updatedAt          {string}         — ISO 8601 timestamp of last profile change
 *     interests          {string[]}       — activity/interest tags
 *     budgetRange        {string}         — "low" | "medium" | "high"
 *     locationPreference {string}         — "indoor" | "outdoor" | "any"
 *     sleepTime          {string}         — "HH:mm" (24h)
 *     wakeTime           {string}         — "HH:mm" (24h)
 *     weeklyActivities   {string[]}       — e.g. gym, work, study
 *     mealPreferences    {string[]}       — meal style tags
 *     weeklyBudget       {number}         — numeric weekly spend signal
 *     typeAffinity       {object}         — { [placeType]: number } persistent affinity scores (v6)
 *     seenPlaces         {string[]}       — ordered list of place ids the user has engaged with
 *     embedding          {object}         — { [dimension]: float 0-1 } long-term taste vector (v9)
 *     (Phase 13) typeAffinity updates use repeat reinforcement + global scale-down
 *                when the map magnitude grows too large.
 */

import { db } from "../config/firebase.js";
import { normalizeEmbedding } from "../utils/embedding.js";
import { logger } from "../utils/logger.js";

/** Firestore collection name — single source of truth */
const USERS_COLLECTION = "users";

/**
 * Finds an existing user document or creates one on first login.
 *
 * Called every time a verified user hits GET /api/profile.
 * Uses the decoded Firebase ID token as the authoritative source of identity.
 *
 * @param {import("firebase-admin").auth.DecodedIdToken} decodedToken
 *   The verified token payload attached to req.user by auth.middleware.js
 *
 * @returns {Promise<{uid: string, email: string|null, name: string|null, createdAt: string}>}
 *   The persisted user document (existing or freshly created)
 */
export const findOrCreateUser = async (decodedToken) => {
  const { uid, email, name } = decodedToken;

  // Reference to the user's document (keyed by Firebase UID)
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();

  // --- Returning user: document already exists ---
  if (userSnap.exists) {
    return userSnap.data();
  }

  // --- First login: create the user document ---
  const newUser = {
    uid,
    email: email ?? null,
    // name is only present in the token if the user set a display name in Firebase Auth
    name: name ?? null,
    createdAt: new Date().toISOString(),
  };

  // set() creates the document (or overwrites — safe here because we checked existence above)
  await userRef.set(newUser);

  return newUser;
};

/**
 * Retrieves a user document by UID.
 *
 * Useful for admin lookups or future inter-service calls.
 *
 * @param {string} uid
 * @returns {Promise<{uid: string, email: string|null, name: string|null, createdAt: string} | null>}
 *   The user object, or null if no document exists for that UID
 */
export const getUserById = async (uid) => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();

  if (!userSnap.exists) {
    return null;
  }

  return userSnap.data();
};

/**
 * Retrieves a user document by email address.
 *
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export const getUserByEmail = async (email) => {
  if (!email) return null;
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
};

/**
 * Updates mutable profile fields for an existing user.
 *
 * Only the keys present in `updates` are written — Firestore's update()
 * performs a partial merge so untouched fields (uid, email, createdAt, etc.)
 * are preserved.
 *
 * Allowed mutable fields:
 *   name               {string}    — display name
 *   interests          {string[]}  — list of activity/interest tags
 *   budgetRange        {string}    — e.g. "low" | "medium" | "high"
 *   locationPreference {string}    — e.g. "indoor" | "outdoor" | "any"
 *   sleepTime          {string}
 *   wakeTime           {string}
 *   weeklyActivities   {string[]}
 *   mealPreferences    {string[]}
 *   weeklyBudget       {number}
 *
 * @param {string} uid     — Firebase Auth UID (from verified token, never from body)
 * @param {object} updates — validated fields to merge
 *
 * @returns {Promise<object>} The full updated user document
 *
 * @throws {Error} if the user document does not exist
 */
export const updateUserProfile = async (uid, updates) => {
  const userRef  = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    const err = new Error("User profile not found");
    err.statusCode = 404;
    throw err;
  }

  // Merge only the supplied keys — system fields are never overwritten.
  await userRef.update({ ...updates, updatedAt: new Date().toISOString() });

  const updated = await userRef.get();
  return updated.data();
};

// ─── Affinity weights for real-time learning ─────────────────────────────────
// These are distinct from the interaction.service ACTION_SCORES which measure
// individual event value. These weights specifically drive the persistent
// per-type affinity model that lives on the user document.

export const AFFINITY_WEIGHTS = Object.freeze({
  view:    1,
  click:   2,
  save:    4,   // stronger signal than the transient +3 in ACTION_SCORES
  dismiss: -3,
});

/** Maximum absolute value stored in typeAffinity for any single type. */
const AFFINITY_CAP = 50;

/**
 * When the largest |typeAffinity| across all types exceeds this value, the
 * entire map is scaled down proportionally (Phase 13 — prevents slow drift explosion).
 */
const AFFINITY_MAP_RESCALE_THRESHOLD = 45;

// ─── Embedding learning rates (Phase 9) ──────────────────────────────────────
// How much each action type shifts the user's embedding for the interacted type.
// Values are small deltas applied to the [0, 1] embedding space.

export const EMBEDDING_LEARNING_RATES = Object.freeze({
  view:    0.03,
  click:   0.08,
  save:    0.15,
  dismiss: -0.10,
});

/**
 * Scales all typeAffinity entries proportionally when max |v| exceeds threshold.
 *
 * @param {Record<string, number>} map
 * @returns {Record<string, number>}
 */
const rescaleAffinityMapIfNeeded = (map) => {
  let maxAbs = 0;
  for (const v of Object.values(map)) {
    const a = Math.abs(v ?? 0);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs <= AFFINITY_MAP_RESCALE_THRESHOLD || maxAbs === 0) return map;

  const scale = AFFINITY_MAP_RESCALE_THRESHOLD / maxAbs;
  const out   = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = (v ?? 0) * scale;
  }
  return out;
};

/**
 * Updates the user's persistent intelligence after a new interaction.
 *
 * Three things happen in a single atomic Firestore update:
 *   1. typeAffinity is updated with affinity weight + Phase 13 repeat bonus,
 *      per-key cap, and optional global rescale when the map grows too large.
 *   2. The placeId is prepended to seenPlaces (if it isn't already the most
 *      recent entry) and the list is trimmed to the last 200 entries.
 *   3. (Phase 9) embedding[placeType] is shifted by EMBEDDING_LEARNING_RATES
 *      and the whole vector is re-normalized so all values stay in [0, 1].
 *
 * This function is fire-and-forget from the caller's perspective — it does not
 * throw on failure (logs a warning instead) so that interaction logging always
 * succeeds even if the intelligence update has a transient error.
 *
 * @param {string} uid        — Firebase Auth UID
 * @param {string} placeType  — catalogue place type, e.g. "gym"
 * @param {string} placeId    — catalogue place id (Firestore doc id)
 * @param {string} actionType — one of "view" | "click" | "save" | "dismiss"
 */
export const updateUserIntelligence = async (uid, placeType, placeId, actionType) => {
  const affinityWeight   = AFFINITY_WEIGHTS[actionType]        ?? 0;
  const embeddingDelta   = EMBEDDING_LEARNING_RATES[actionType] ?? 0;
  if (!placeType) return;

  try {
    const userRef  = db.collection(USERS_COLLECTION).doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return;

    const data         = userSnap.data();

    // ── typeAffinity update ────────────────────────────────────────────────────
    const current      = data.typeAffinity ?? {};
    const currentValue = current[placeType] ?? 0;

    // Phase 13: reinforce repeated positive engagement with this type.
    const repeatBonus =
      affinityWeight > 0 && currentValue > 0
        ? Math.min(2, affinityWeight * 0.2 + Math.min(1, currentValue / 25))
        : 0;

    const delta        = affinityWeight + repeatBonus;
    let nextMap        = { ...current, [placeType]: currentValue + delta };
    nextMap[placeType] = Math.min(AFFINITY_CAP, Math.max(-AFFINITY_CAP, nextMap[placeType]));

    nextMap = rescaleAffinityMapIfNeeded(nextMap);
    const newValue = nextMap[placeType];

    // ── seenPlaces update ──────────────────────────────────────────────────────
    const seen        = Array.isArray(data.seenPlaces) ? data.seenPlaces : [];
    const updatedSeen = seen[0] === placeId
      ? seen
      : [placeId, ...seen.filter((id) => id !== placeId)].slice(0, 200);

    // ── embedding update (Phase 9) ─────────────────────────────────────────────
    const prevEmbedding  = data.embedding ?? {};
    const prevTypeValue  = prevEmbedding[placeType] ?? 0;
    const nextTypeValue  = Math.min(1, Math.max(0, prevTypeValue + embeddingDelta));
    const rawEmbedding   = { ...prevEmbedding, [placeType]: nextTypeValue };
    const nextEmbedding  = normalizeEmbedding(rawEmbedding);

    await userRef.update({
      typeAffinity: nextMap,
      seenPlaces:   updatedSeen,
      embedding:    nextEmbedding,
      updatedAt:  new Date().toISOString(),
    });

    logger.info(
      `[intelligence] uid=${uid} type=${placeType}` +
      ` affinity=${currentValue}->${newValue}` +
      ` embed=${prevTypeValue.toFixed(3)}->${nextTypeValue.toFixed(3)}`
    );
  } catch (err) {
    logger.warn(`[intelligence] Failed to update intelligence for uid=${uid}:`, { error: err.message });
  }
};
