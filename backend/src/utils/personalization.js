/**
 * personalization.js — Phase 16: advanced personalization layer.
 *
 * Multi-interest weighting, habit detection from interaction timestamps,
 * compound context boosts, and top-N diversity enforcement for recommendations.
 */

import { VALID_TYPES } from "../services/place.service.js";
import { interactionAgeDecayWeight } from "./learning.js";
import { hourToTimeOfDay } from "./context.js";

const VALID_SET = new Set(VALID_TYPES);

/** Declared-interest prior (before much interaction data exists). */
const DECLARED_INTEREST_PRIOR = 2;

/** Scale profile.typeAffinity into the same score space as recency signal. */
const TYPE_AFFINITY_SCALE = 0.15;

/** Habit detection: minimum typed interactions in the analysis window. */
const HABIT_MIN_EVENTS = 3;

/** Habit detection: share of events that must fall in the habit band. */
const HABIT_SHARE_THRESHOLD = 0.35;

/** Max analysis window for habits (newest-first slice). */
const HABIT_WINDOW = 40;

const TAG_ALIASES = Object.freeze({
  cafe:    "coffee",
  cafes:   "coffee",
  fitness: "gym",
  run:     "walk",
  running: "walk",
  park:    "park",
  bar:     "social",
});

const FITNESS_TYPES = new Set(["gym", "yoga"]);
const RELAX_TYPES   = new Set(["coffee", "cafe"]);

/**
 * Maps a user-declared interest tag to a canonical catalogue place type.
 *
 * @param {string} tag
 * @returns {string|null}
 */
export const normalizeInterestTag = (tag) => {
  if (tag == null || typeof tag !== "string") return null;
  const t = tag.trim().toLowerCase();
  if (!t) return null;
  const aliased = TAG_ALIASES[t] ?? t;
  return VALID_SET.has(aliased) ? aliased : null;
};

/**
 * Builds normalized per-type weights (sum ≈ 1) from recency-weighted interactions,
 * profile.typeAffinity, and declared profile.interests.
 *
 * @param {object|null} profile
 * @param {object[]} recentInteractions — newest-first, windowed
 * @param {Date} now
 * @param {(placeId: string) => object|undefined} resolvePlace — placeId → place doc
 * @returns {{ weights: Map<string, number>, topTypes: string[] }}
 */
export const buildTopInterestWeights = (profile, recentInteractions, now, resolvePlace) => {
  const raw = new Map();
  const n   = recentInteractions.length;

  recentInteractions.forEach((interaction, index) => {
    const place = resolvePlace(interaction.placeId);
    if (!place) return;
    const recencyFactor = n ? (n - index) / n : 1;
    const ageDecay      = interactionAgeDecayWeight(interaction.createdAt, now);
    const contrib       = (interaction.score ?? 0) * recencyFactor * ageDecay;
    raw.set(place.type, (raw.get(place.type) ?? 0) + contrib);
  });

  const aff = profile?.typeAffinity ?? {};
  for (const [t, v] of Object.entries(aff)) {
    const canon = normalizeInterestTag(t) ?? (VALID_SET.has(t) ? t : null);
    if (!canon) continue;
    raw.set(canon, (raw.get(canon) ?? 0) + Math.abs(Number(v) || 0) * TYPE_AFFINITY_SCALE);
  }

  for (const tag of profile?.interests ?? []) {
    const t = normalizeInterestTag(tag);
    if (!t) continue;
    raw.set(t, (raw.get(t) ?? 0) + DECLARED_INTEREST_PRIOR);
  }

  let sum = 0;
  for (const v of raw.values()) sum += v;

  const weights = new Map();
  if (sum <= 0) return { weights, topTypes: [] };

  for (const [t, v] of raw.entries()) {
    weights.set(t, v / sum);
  }

  const topTypes = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  return { weights, topTypes };
};

/**
 * Boost when place.type is among the top-K weighted interests; scales with weight.
 *
 * @param {string} placeType
 * @param {Map<string, number>} normalizedWeights
 * @param {number} topK
 * @param {number} maxBoost — cap for the strongest match
 * @returns {{ boost: number, weightUsed: number }}
 */
export const multiInterestBalanceBoost = (placeType, normalizedWeights, topK, maxBoost) => {
  if (!normalizedWeights.size || topK <= 0) {
    return { boost: 0, weightUsed: 0 };
  }

  const sorted = [...normalizedWeights.entries()].sort((a, b) => b[1] - a[1]);
  const top    = sorted.slice(0, topK);
  const entry  = top.find(([t]) => t === placeType);
  if (!entry) return { boost: 0, weightUsed: 0 };

  const [, w] = entry;
  const rank  = top.findIndex(([t]) => t === placeType);
  const rankFactor = topK > 1 ? (topK - rank) / topK : 1;

  const boost = maxBoost * w * rankFactor;
  return { boost: +boost.toFixed(3), weightUsed: +w.toFixed(4) };
};

/**
 * @param {object[]} interactions — raw user interactions
 * @param {Date} now
 * @param {(placeId: string) => object|undefined} resolvePlace
 * @returns {{ habits: string[], signals: Record<string, number> }}
 */
export const detectDominantHabits = (interactions, now, resolvePlace) => {
  const signals = {};
  const habits  = [];

  const sorted = [...interactions]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, HABIT_WINDOW);

  let gymTotal = 0;
  let gymMorning = 0;
  let socialTotal = 0;
  let socialWeekend = 0;
  let relaxTotal = 0;
  let relaxWeekend = 0;

  for (const ix of sorted) {
    const place = resolvePlace(ix.placeId);
    if (!place) continue;
    const d = ix.createdAt ? new Date(ix.createdAt) : now;
    const hour = d.getHours();
    const dow  = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const tod = hourToTimeOfDay(hour);

    if (place.type === "gym") {
      gymTotal += 1;
      if (tod === "morning") gymMorning += 1;
    }
    if (place.type === "social") {
      socialTotal += 1;
      if (isWeekend) socialWeekend += 1;
    }
    if (RELAX_TYPES.has(place.type)) {
      relaxTotal += 1;
      if (isWeekend) relaxWeekend += 1;
    }
  }

  signals.morningGymShare     = gymTotal ? gymMorning / gymTotal : 0;
  signals.weekendSocialShare  = socialTotal ? socialWeekend / socialTotal : 0;
  signals.weekendRelaxShare   = relaxTotal ? relaxWeekend / relaxTotal : 0;

  if (gymTotal >= HABIT_MIN_EVENTS && signals.morningGymShare >= HABIT_SHARE_THRESHOLD) {
    habits.push("morning_gym");
  }
  if (socialTotal >= HABIT_MIN_EVENTS && signals.weekendSocialShare >= HABIT_SHARE_THRESHOLD) {
    habits.push("weekend_social");
  }
  if (relaxTotal >= HABIT_MIN_EVENTS && signals.weekendRelaxShare >= HABIT_SHARE_THRESHOLD) {
    habits.push("weekend_coffee");
  }

  return { habits, signals };
};

/**
 * Boost when current context matches a detected habit and place type.
 *
 * @param {object} place
 * @param {{ timeOfDay: string, isWeekend: boolean }} context
 * @param {string[]} dominantHabits
 * @param {number} boostPerHabit
 * @returns {number}
 */
export const computeHabitContextBoost = (place, context, dominantHabits, boostPerHabit) => {
  let total = 0;
  if (!dominantHabits.length) return 0;

  if (dominantHabits.includes("morning_gym") && context.timeOfDay === "morning" && place.type === "gym") {
    total += boostPerHabit;
  }
  if (dominantHabits.includes("weekend_social") && context.isWeekend && place.type === "social") {
    total += boostPerHabit;
  }
  if (dominantHabits.includes("weekend_coffee") && context.isWeekend && RELAX_TYPES.has(place.type)) {
    total += boostPerHabit;
  }

  return +total.toFixed(3);
};

const intentMatchesType = (intent, placeType) => {
  if (intent === "fitness") return FITNESS_TYPES.has(placeType);
  if (intent === "social")  return placeType === "social";
  if (intent === "relax")   return RELAX_TYPES.has(placeType);
  return false;
};

/**
 * Compound boost when session intent, detected intent, place type, and
 * (habits or interest weight) align.
 *
 * @param {object} place
 * @param {string} sessionIntent
 * @param {string} detectedIntent
 * @param {string[]} dominantHabits
 * @param {Map<string, number>} interestWeights
 * @param {number} maxBoost
 * @returns {number}
 */
export const computeContextStackBoost = (
  place,
  sessionIntent,
  detectedIntent,
  dominantHabits,
  interestWeights,
  maxBoost
) => {
  const sOk = intentMatchesType(sessionIntent, place.type);
  const dOk = intentMatchesType(detectedIntent, place.type);
  if (!sOk || !dOk) return 0;

  const w = interestWeights.get(place.type) ?? 0;
  const habitAligned =
    (dominantHabits.includes("morning_gym") && place.type === "gym") ||
    (dominantHabits.includes("weekend_social") && place.type === "social") ||
    (dominantHabits.includes("weekend_coffee") && RELAX_TYPES.has(place.type));

  if (!habitAligned && w < 0.12) return 0;

  const habitFactor = habitAligned ? 1 : 0.5;
  const weightFactor = Math.min(1, w * 4);
  const boost = maxBoost * habitFactor * Math.max(0.35, weightFactor);

  return +boost.toFixed(3);
};

// ─── Weekly Activities boost map ─────────────────────────────────────────────
// Maps onboarding `weeklyActivities` entries → canonical place types they imply.

const ACTIVITY_TYPE_MAP = Object.freeze({
  gym:         ["gym", "yoga"],
  running:     ["gym", "outdoor"],
  yoga:        ["yoga", "gym"],
  hiking:      ["outdoor"],
  cycling:     ["outdoor", "gym"],
  swimming:    ["gym", "outdoor"],
  coffee:      ["coffee", "cafe"],
  reading:     ["coffee", "cafe"],
  coding:      ["coffee", "workspace"],
  studying:    ["coffee", "cafe"],
  social:      ["social"],
  cooking:     ["restaurant"],
  music:       ["music", "social"],
  movies:      ["cinema"],
  gaming:      ["social", "cafe"],
  prayer:      ["church", "mosque", "worship"],
  meditation:  ["yoga", "outdoor"],
  shopping:    ["shop", "mall"],
  art:         ["art", "museum"],
  sports:      ["gym", "sports"],
  walking:     ["outdoor"],
  fitness:     ["gym", "yoga"],
  work:        ["workspace", "coffee"],
  relax:       ["spa", "coffee", "outdoor"],
});

/**
 * Computes a score boost for a place based on how many of the user's
 * declared weekly activities align with the place type.
 *
 * @param {string}   placeType        — canonical place type
 * @param {string[]} weeklyActivities — from profile.weeklyActivities
 * @returns {number} boost in [0, 5]
 */
export const weeklyActivitiesBoost = (placeType, weeklyActivities) => {
  if (!weeklyActivities?.length || !placeType) return 0;
  const pt = placeType.toLowerCase();
  let matched = 0;
  for (const activity of weeklyActivities) {
    const types = ACTIVITY_TYPE_MAP[activity?.toLowerCase()] ?? [];
    if (types.includes(pt)) matched += 1;
  }
  if (matched === 0) return 0;
  // Each matching activity contributes 2 pts, capped at 5
  return Math.min(5, matched * 2);
};

/**
 * Returns a score penalty for gender-specific places that don't match the user.
 *
 * @param {string} placeType   — canonical place type
 * @param {string} placeName   — place name (lowercase)
 * @param {string} userGender  — "male"|"female"|"non_binary"|"prefer_not_to_say"|""
 * @returns {number} penalty (negative) or 0
 */
export const genderContextScore = (placeType, placeName, userGender) => {
  if (!userGender || userGender === "prefer_not_to_say" || userGender === "non_binary") return 0;
  const ptype = (placeType || "").toLowerCase();
  const name  = (placeName  || "").toLowerCase();

  const isFemalePlace =
    ["nail_salon", "beauty_salon", "ladies_salon", "women_salon"].includes(ptype) ||
    ["ladies only", "women only", "female only", "ladies salon", "womens"].some((k) => name.includes(k));

  const isMalePlace =
    ["barbershop", "barber", "mens_salon"].includes(ptype) ||
    ["men only", "gents only", "male only", "barber", "gents salon"].some((k) => name.includes(k));

  if (isFemalePlace && userGender === "male")   return -4;
  if (isMalePlace   && userGender === "female") return -4;
  return 0;
};

/**
 * Serialises top interest weights for meta (plain object, top `limit` types).
 *
 * @param {Map<string, number>} weights
 * @param {number} limit
 * @returns {Record<string, number>}
 */
export const topWeightsForMeta = (weights, limit = 5) => {
  const out = {};
  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  for (const [t, w] of sorted) {
    out[t] = +w.toFixed(4);
  }
  return out;
};

/**
 * Ensures no place type appears more than `maxPerType` times in the first `n`
 * recommendation slots by swapping in higher-scoring alternatives from the pool.
 *
 * @param {object[]} recommendations — mutated in place
 * @param {object[]} candidatePool — score-sorted candidates (e.g. withoutDismissed)
 * @param {number} n — usually 5
 * @param {number} maxPerType — usually 2
 */
export const enforceMaxSameTypeInTopN = (recommendations, candidatePool, n = 5, maxPerType = 2) => {
  const topLen = Math.min(n, recommendations.length);
  if (topLen === 0) return;

  const pool = [...candidatePool].sort((a, b) => b.score - a.score);

  for (let iter = 0; iter < 40; iter++) {
    const counts = new Map();
    for (let i = 0; i < topLen; i++) {
      const t = recommendations[i].type;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }

    let overType = null;
    for (const [t, c] of counts.entries()) {
      if (c > maxPerType) {
        overType = t;
        break;
      }
    }
    if (!overType) break;

    const idxs = [];
    for (let i = 0; i < topLen; i++) {
      if (recommendations[i].type === overType) idxs.push(i);
    }
    idxs.sort((i, j) => recommendations[i].score - recommendations[j].score);
    const replaceIdx = idxs[0];

    const used = new Set(recommendations.map((e) => e.id));
    const next = pool.find((c) => !used.has(c.id) && c.type !== overType);
    if (!next) break;

    recommendations[replaceIdx] = next;
  }
};
