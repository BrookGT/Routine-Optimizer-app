/**
 * services/aiSchedule.service.js — AI Daily Schedule Builder
 *
 * Builds a personalized daily schedule split into morning / afternoon /
 * evening / night by combining:
 *   1. User routines for today (primary)  → source = "routine"
 *   2. Profile / onboarding data (fallback) → source = "onboarding"
 *   3. Behavioural interaction signals      → personalizationLevel signal
 *   4. AI recommendation engine per slot   → place enrichment
 *
 * Constraints applied automatically:
 *   - Religion filter: only surface religious places that match the user's faith.
 *   - Budget filter: skip places priced above the user's budgetRange.
 *   - Pricing visibility: churches / mosques / parks / libraries never show pricing.
 */

import { db }               from "../config/firebase.js";
import { getUserById }      from "./user.service.js";
import { getRecommendations } from "./recommendation.service.js";
import { logger }           from "../utils/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_KEYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const PERIOD_ORDER = { morning: 0, afternoon: 1, evening: 2, night: 3 };

const ACTIVITY_ICON_MAP = {
  gym:        "barbell-outline",
  yoga:       "body-outline",
  coffee:     "cafe",
  reading:    "book",
  hiking:     "map-outline",
  shopping:   "bag",
  restaurant: "restaurant",
  study:      "school",
  work:       "laptop-outline",
  walk:       "location-outline",
  cinema:     "film-outline",
  social:     "people",
  church:     "business-outline",
  mosque:     "business-outline",
  temple:     "business-outline",
  default:    "ellipse-outline",
};

const ACTIVITY_DURATION = {
  gym:        "60 min",
  yoga:       "45 min",
  coffee:     "30 min",
  reading:    "45 min",
  hiking:     "90 min",
  shopping:   "60 min",
  restaurant: "45 min",
  study:      "90 min",
  work:       "120 min",
  walk:       "30 min",
  cinema:     "120 min",
  social:     "60 min",
  default:    "45 min",
};

// activityType → discoverKey used by the recommendation engine
const ACTIVITY_TO_DISCOVER_KEY = {
  gym:        "gym",
  yoga:       "gym",
  hiking:     "gym",
  coffee:     "cafe",
  reading:    "cafe",
  restaurant: "restaurant",
  shopping:   "shopping",
  cinema:     "events",
  social:     "restaurant",
  church:     "church",
  mosque:     "mosque",
  temple:     null,
};

const ACTIVITY_COLORS = [
  "#14B8A6", "#8B5CF6", "#F472B6", "#FB923C",
  "#38BDF8", "#A3E635", "#F59E0B", "#6366F1",
];

// ─── Micro-activity gap filling ───────────────────────────────────────────────

/** Minimum free gap (minutes) before inserting a micro-activity */
const MICRO_GAP_MIN = 90;
/** Skip if gap is larger (overnight, different day) */
const MICRO_GAP_MAX = 300;
/** At most 2 micro-activities injected per day */
const MICRO_DAILY_CAP = 2;

const MICRO_TEMPLATES = [
  {
    id: "micro-coffee",
    activityType: "coffee",
    title: "Quick coffee break",
    duration: "20 min",
    icon: "cafe",
    color: "#F472B6",
    baseReason: "Short recharge between activities",
    baseBadge: { key: "micro", label: "Quick break", variant: "orange" },
    discoverKey: "cafe",
  },
  {
    id: "micro-walk",
    activityType: "walk",
    title: "Short walk",
    duration: "20 min",
    icon: "walk-outline",
    color: "#38BDF8",
    baseReason: "Movement keeps your energy and focus up",
    baseBadge: { key: "micro", label: "Active break", variant: "blue" },
    discoverKey: null,
  },
  {
    id: "micro-workspace",
    activityType: "study",
    title: "Quiet work spot",
    duration: "45 min",
    icon: "laptop-outline",
    color: "#A3E635",
    baseReason: "Make the most of your free time",
    baseBadge: { key: "micro", label: "Free slot", variant: "green" },
    discoverKey: "cafe",
  },
  {
    id: "micro-reading",
    activityType: "reading",
    title: "Reading break",
    duration: "30 min",
    icon: "book-outline",
    color: "#6366F1",
    baseReason: "A calm spot nearby to reset your mind",
    baseBadge: { key: "micro", label: "Unwind", variant: "purple" },
    discoverKey: "cafe",
  },
  {
    id: "micro-networking",
    activityType: "social",
    title: "Networking event nearby",
    duration: "45 min",
    icon: "people-outline",
    color: "#FB923C",
    baseReason: "Small gathering that fits your free time",
    baseBadge: { key: "micro", label: "Opportunity", variant: "orange" },
    discoverKey: "events",
  },
];

function timeToMinutes(timeStr) {
  const { h, m } = parseHHmm(timeStr ?? "00:00");
  return h * 60 + m;
}

function determinePeriodFromHour(hour) {
  if (hour >= 5  && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function pickMicroTemplate(prevSlot, gapMin, profile) {
  const prevAct = (prevSlot.activityType ?? "").toLowerCase();
  const acts    = Array.isArray(profile?.weeklyActivities) ? profile.weeklyActivities : [];
  const period  = prevSlot.period ?? "morning";

  // Post-workout → coffee
  if (prevAct === "gym" || prevAct === "yoga")
    return MICRO_TEMPLATES[0];

  // After desk work → walk
  if (prevAct === "work" || prevAct === "study")
    return MICRO_TEMPLATES[1];

  // Large afternoon gap + social interest → networking event
  if (gapMin >= 150 && period === "afternoon" && acts.includes("social"))
    return MICRO_TEMPLATES[4];

  // Large gap + reading interest → reading spot
  if (gapMin >= 120 && acts.includes("reading"))
    return MICRO_TEMPLATES[3];

  // Large gap → workspace
  if (gapMin >= 120)
    return MICRO_TEMPLATES[2];

  // Default: coffee break
  return MICRO_TEMPLATES[0];
}

/**
 * Detect free-time gaps between consecutive slots and inject contextual
 * micro-activities (coffee break, walk, workspace, etc.).
 */
function insertMicroActivities(slots, profile) {
  if (slots.length < 2) return slots;

  const result    = [];
  let microCount  = 0;

  for (let i = 0; i < slots.length; i++) {
    result.push(slots[i]);

    if (i < slots.length - 1 && microCount < MICRO_DAILY_CAP) {
      const curr   = slots[i];
      const next   = slots[i + 1];
      const currM  = timeToMinutes(curr.time ?? "07:00");
      const nextM  = timeToMinutes(next.time ?? "12:00");
      const gapMin = nextM - currM;

      if (gapMin >= MICRO_GAP_MIN && gapMin <= MICRO_GAP_MAX) {
        const tmpl  = pickMicroTemplate(curr, gapMin, profile);
        const midM  = currM + Math.floor(gapMin * 0.45); // insert before midpoint
        const hour  = Math.floor(midM / 60) % 24;
        const period = determinePeriodFromHour(hour);

        microCount++;
        result.push({
          ...tmpl,
          id:                 `${tmpl.id}-${i}`,
          period,
          time:               minutesToHHmm(midM),
          source:             "ai_inferred",
          routineId:          null,
          locationPreference: "any",
          budgetRange:        profile?.budgetRange ?? "low",
          isMicro:            true,
          reason:             tmpl.baseReason,
          badges: [
            tmpl.baseBadge,
            { key: "ai", label: "AI suggested", variant: "teal" },
          ],
        });
      }
    }
  }

  return result;
}

// Place types that must NEVER show pricing
const FREE_PLACE_TYPES = new Set([
  "church", "mosque", "temple", "shrine", "place_of_worship",
  "park", "library", "public_space", "beach", "museum_free",
]);

const RELIGION_TO_PLACE_TYPE = {
  christian: "church",
  muslim:    "mosque",
  buddhist:  "temple",
  hindu:     "temple",
  jewish:    "synagogue",
};

// Budget level numeric thresholds (Google price_level 0-4)
const BUDGET_PRICE_CAP = { low: 1, medium: 2, high: 4 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function activityIcon(type) {
  return ACTIVITY_ICON_MAP[(type || "").toLowerCase()] ?? ACTIVITY_ICON_MAP.default;
}

function activityDuration(type) {
  return ACTIVITY_DURATION[(type || "").toLowerCase()] ?? ACTIVITY_DURATION.default;
}

function determinePeriod(timeOfDay) {
  switch ((timeOfDay || "").toLowerCase()) {
    case "morning":   return "morning";
    case "afternoon": return "afternoon";
    case "evening":   return "evening";
    case "night":     return "night";
    default:          return "morning";
  }
}

function parseHHmm(str) {
  if (!str || typeof str !== "string") return { h: 7, m: 0 };
  const [a, b] = str.split(":").map(x => parseInt(x, 10));
  return { h: isNaN(a) ? 7 : a, m: isNaN(b) ? 0 : b };
}

function minutesToHHmm(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildDisplayTitle(activityType, period) {
  const a = (activityType || "").toLowerCase();
  const p = (period || "morning").toLowerCase();
  const MAP = {
    "morning-gym":          "Morning workout",
    "morning-yoga":         "Morning yoga",
    "morning-coffee":       "Morning coffee",
    "morning-work":         "Morning focus",
    "morning-study":        "Morning study",
    "morning-walk":         "Morning walk",
    "morning-hiking":       "Morning hike",
    "afternoon-restaurant": "Lunch break",
    "afternoon-coffee":     "Afternoon coffee",
    "afternoon-work":       "Work session",
    "afternoon-study":      "Study session",
    "afternoon-shopping":   "Shopping run",
    "evening-restaurant":   "Dinner plans",
    "evening-social":       "Evening out",
    "evening-cinema":       "Movie night",
    "evening-walk":         "Evening walk",
    "evening-hiking":       "Evening hike",
    "evening-church":       "Evening prayer",
    "evening-mosque":       "Evening prayer",
    "night-restaurant":     "Late dinner",
    "night-social":         "Night out",
  };
  const key = `${p}-${a}`;
  if (MAP[key]) return MAP[key];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(p)} ${a}`;
}

function pricingEnabled(place) {
  if (!place) return false;
  const t = `${place.type ?? ""} ${place.category ?? ""}`.toLowerCase();
  for (const ft of FREE_PLACE_TYPES) {
    if (t.includes(ft)) return false;
  }
  return place.pricingEnabled !== false;
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadRoutinesForToday(uid) {
  try {
    const todayKey = WEEKDAY_KEYS[new Date().getDay()];
    const snap = await db.collection("routines").where("userId", "==", uid).get();
    return snap.docs
      .map(d => d.data())
      .filter(r => (r.weekday || "").toLowerCase() === todayKey);
  } catch (err) {
    logger.warn(`[aiSchedule] loadRoutines error: ${err.message}`);
    return [];
  }
}

async function loadInteractionCount(uid) {
  try {
    const snap = await db.collection("interactions")
      .where("userId", "==", uid)
      .limit(100)
      .get();
    return snap.size;
  } catch {
    return 0;
  }
}

// ─── Slot builders ────────────────────────────────────────────────────────────

function buildSlotsFromRoutines(routines, profile) {
  const { h: wakeH } = parseHHmm(profile?.wakeTime ?? "07:00");
  const sorted = [...routines].sort((a, b) => {
    const oa = PERIOD_ORDER[determinePeriod(a.timeOfDay)] ?? 9;
    const ob = PERIOD_ORDER[determinePeriod(b.timeOfDay)] ?? 9;
    return oa - ob;
  });

  const counters = { morning: 0, afternoon: 0, evening: 0, night: 0 };

  return sorted.map((r, i) => {
    const period = determinePeriod(r.timeOfDay);
    const cnt = counters[period]++;

    let baseMin;
    if (period === "morning")   baseMin = wakeH * 60 + cnt * 90;
    else if (period === "afternoon") baseMin = 12 * 60 + 30 + cnt * 60;
    else if (period === "evening")   baseMin = 18 * 60 + 30 + cnt * 75;
    else                             baseMin = 21 * 60 + cnt * 60;

    const activityType = (r.activityType || "social").toLowerCase();
    return {
      id:                 r.id ?? `routine-${i}`,
      period,
      time:               minutesToHHmm(Math.min(baseMin, 23 * 60 + 30)),
      activityType,
      locationPreference: (r.locationPreference || "any").toLowerCase(),
      budgetRange:        (r.budgetRange || "medium").toLowerCase(),
      source:             "routine",
      routineId:          r.id ?? null,
      icon:               activityIcon(activityType),
      color:              ACTIVITY_COLORS[i % ACTIVITY_COLORS.length],
      title:              buildDisplayTitle(activityType, period),
      duration:           activityDuration(activityType),
    };
  });
}

function buildFallbackSlots(profile) {
  const { h: wakeH } = parseHHmm(profile?.wakeTime ?? "07:00");
  const acts = Array.isArray(profile?.weeklyActivities) ? profile.weeklyActivities : [];
  const has = x => acts.includes(x);
  const budget = profile?.budgetRange ?? "medium";

  const raw = [
    {
      id: "fb-0", period: "morning",
      time: minutesToHHmm(wakeH * 60),
      activityType: has("gym") ? "gym" : "walk",
      locationPreference: "outdoor", budgetRange: "low",
    },
    {
      id: "fb-1", period: "morning",
      time: minutesToHHmm(wakeH * 60 + 90),
      activityType: has("study") ? "study" : has("work") ? "work" : "coffee",
      locationPreference: "indoor", budgetRange: budget,
    },
    {
      id: "fb-2", period: "afternoon",
      time: "13:00",
      activityType: "restaurant",
      locationPreference: "any", budgetRange: budget,
    },
    {
      id: "fb-3", period: "evening",
      time: "19:00",
      activityType: has("social") ? "social" : has("cinema") ? "cinema" : "restaurant",
      locationPreference: "any", budgetRange: budget,
    },
  ];

  // Insert a religious slot if the user has a religion set
  const relType = RELIGION_TO_PLACE_TYPE[(profile?.religion ?? "").toLowerCase()];
  if (relType) {
    raw.push({
      id: "fb-rel", period: "evening",
      time: "17:00",
      activityType: relType,
      locationPreference: "any", budgetRange: "low",
    });
  }

  return raw.map((s, i) => ({
    ...s,
    source:   "onboarding",
    routineId: null,
    icon:     activityIcon(s.activityType),
    color:    ACTIVITY_COLORS[i % ACTIVITY_COLORS.length],
    title:    buildDisplayTitle(s.activityType, s.period),
    duration: activityDuration(s.activityType),
  }));
}

// ─── Reason & badge generation ────────────────────────────────────────────────

const REASON_TEMPLATES = {
  routine_gym:        "Based on your morning gym routine",
  routine_coffee:     "Based on your coffee routine",
  routine_restaurant: "Matches your scheduled meal time",
  routine_social:     "Part of your evening social routine",
  onboarding_gym:     "You said you enjoy gym — we found one nearby",
  onboarding_coffee:  "Great morning coffee spot near you",
  onboarding_restaurant: "Perfect for your scheduled lunch",
  interaction_gym:    "You frequently browse gyms in the morning",
  interaction_coffee: "You often save cafés — here's a top one",
  interaction_restaurant: "Based on your recent restaurant views",
  default_morning:    "A great way to start your morning",
  default_afternoon:  "Ideal for your afternoon schedule",
  default_evening:    "Recommended for your evening",
  default_night:      "A perfect way to end your day",
};

function buildReason(slot, interactionCount) {
  const { activityType, source, period } = slot;
  const a = (activityType || "").toLowerCase();
  const p = (period || "morning").toLowerCase();

  if (source === "routine") {
    return REASON_TEMPLATES[`routine_${a}`] ?? `Based on your ${p} ${a} routine`;
  }
  if (interactionCount >= 20) {
    return REASON_TEMPLATES[`interaction_${a}`] ?? `Based on your recent ${a} activity`;
  }
  if (source === "onboarding") {
    return REASON_TEMPLATES[`onboarding_${a}`] ?? `Matched to your ${a} preference`;
  }
  return REASON_TEMPLATES[`default_${p}`] ?? `Recommended for your ${p} schedule`;
}

function buildBadges(slot, profile, place, interactionCount) {
  const badges = [];
  const { source, activityType } = slot;

  if (source === "routine") {
    badges.push({ key: "routine", label: "Based on your routine", variant: "purple" });
  } else if (interactionCount >= 20) {
    badges.push({ key: "activity", label: "Based on recent activity", variant: "blue" });
  } else {
    badges.push({ key: "profile", label: "Based on your profile", variant: "blue" });
  }

  if (place?.budgetFit === true || place?.matches?.budget === true) {
    badges.push({ key: "budget", label: "Matches your budget", variant: "green" });
  }

  if (place?.rating != null && place.rating >= 4.2) {
    badges.push({ key: "popular", label: "Popular near you", variant: "orange" });
  }

  if (
    source === "routine" &&
    interactionCount >= 10 &&
    ["gym", "coffee", "restaurant"].includes((activityType || "").toLowerCase())
  ) {
    badges.push({ key: "personalized", label: "Personalized for you", variant: "teal" });
  }

  return badges.slice(0, 3);
}

// ─── Place enrichment ─────────────────────────────────────────────────────────

function religiousPlaceTypeFor(religion) {
  return RELIGION_TO_PLACE_TYPE[(religion ?? "").toLowerCase()] ?? null;
}

function passesReligionFilter(place, profile) {
  if (!profile?.religion) return true;
  const expectedType = religiousPlaceTypeFor(profile.religion);
  const placeTypeStr = `${place.type ?? ""} ${place.category ?? ""}`.toLowerCase();
  const isReligious = ["church", "mosque", "temple", "synagogue", "shrine"]
    .some(rt => placeTypeStr.includes(rt));
  if (!isReligious) return true;
  return expectedType ? placeTypeStr.includes(expectedType) : false;
}

function passesBudgetFilter(place, profile) {
  if (!profile?.budgetRange) return true;
  const cap = BUDGET_PRICE_CAP[profile.budgetRange] ?? 4;
  if (place.priceLevel != null && place.priceLevel > cap) return false;
  return true;
}

async function enrichSlot(slot, uid, userLocation, profile) {
  // Micro-activities carry their own discoverKey from the template
  const discoverKey = slot.isMicro
    ? (slot.discoverKey ?? null)
    : (ACTIVITY_TO_DISCOVER_KEY[slot.activityType] ?? null);

  // Slots that don't map to a place type (pure work/study/walk) get no place card
  if (!discoverKey) return { ...slot, place: null };

  try {
    const { recommendations } = await getRecommendations(
      uid,
      false,           // debug
      5,               // fetch 5, pick best that passes filters
      userLocation,
      true,            // fastMode for speed
      null,            // legacyTypeFilter
      null,            // modeFilter
      discoverKey,
    );

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return { ...slot, place: null };
    }

    // Pick first place that passes all filters
    const chosen = recommendations.find(p =>
      passesReligionFilter(p, profile) && passesBudgetFilter(p, profile)
    ) ?? null;

    if (!chosen) return { ...slot, place: null };

    const pe = pricingEnabled(chosen);
    return {
      ...slot,
      place: {
        id:            chosen.placeId ?? chosen.id,
        placeId:       chosen.placeId ?? chosen.id,
        name:          chosen.name ?? "Recommended place",
        type:          chosen.type ?? chosen.category ?? "",
        distance:      chosen.distanceText ?? chosen.distance ?? "Nearby",
        rating:        chosen.rating ?? null,
        images:        Array.isArray(chosen.images) ? chosen.images : [],
        image:         chosen.image ?? null,
        reason:        chosen.reason ?? null,
        budgetFit:     chosen.budgetFit ?? null,
        matches:       chosen.matches ?? null,
        priceLevel:    pe ? (chosen.priceLevel ?? null) : null,
        estimatedCost: pe ? (chosen.estimatedCost ?? null) : null,
        priceCategory: pe ? (chosen.priceCategory ?? null) : null,
        pricingEnabled: pe,
        score:         chosen.finalScore ?? chosen.score ?? null,
        lat:           chosen.lat ?? null,
        lng:           chosen.lng ?? null,
        address:       chosen.address ?? null,
        // Pass through all original fields so PlaceDetail works
        ...chosen,
      },
    };
  } catch (err) {
    logger.warn(`[aiSchedule] enrichSlot(${slot.id}) error: ${err.message}`);
    return { ...slot, place: null };
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build a full AI-powered daily schedule for a user.
 *
 * @param {string} uid
 * @param {{ lat: number, lng: number, radiusMeters: number } | null} userLocation
 * @returns {Promise<{ schedule: { morning, afternoon, evening, night }, meta: object }>}
 */
export async function getAiDailySchedule(uid, userLocation = null) {
  const t0 = Date.now();

  const [profile, routinesToday, interactionCount] = await Promise.all([
    getUserById(uid).catch(() => null),
    loadRoutinesForToday(uid),
    loadInteractionCount(uid),
  ]);

  const hasRoutines     = routinesToday.length > 0;
  const hasInteractions = interactionCount >= 10;

  const personalizationLevel =
    hasRoutines && hasInteractions ? "high"   :
    hasRoutines || hasInteractions ? "medium" : "low";

  const basedOn = [];
  if (hasRoutines)                              basedOn.push("routines");
  if (interactionCount > 0)                     basedOn.push("interactions");
  if ((profile?.weeklyActivities?.length ?? 0) > 0) basedOn.push("profile");

  const rawSlots = hasRoutines
    ? buildSlotsFromRoutines(routinesToday, profile)
    : buildFallbackSlots(profile ?? {});

  // Detect free-time gaps and inject contextual micro-activities
  const slotsWithMicro = insertMicroActivities(rawSlots, profile);

  // Enrich all slots concurrently (micro-activity slots that have a discoverKey also get a place)
  const enriched = await Promise.all(
    slotsWithMicro.map(s => enrichSlot(s, uid, userLocation, profile))
  );

  // Attach reason + badges
  const finalSlots = enriched.map(slot => ({
    ...slot,
    reason: buildReason(slot, interactionCount),
    badges: buildBadges(slot, profile, slot.place, interactionCount),
  }));

  // Group into periods
  const schedule = { morning: [], afternoon: [], evening: [], night: [] };
  for (const slot of finalSlots) {
    const p = slot.period ?? "morning";
    if (schedule[p]) schedule[p].push(slot);
  }

  // Sort within each period by time string
  for (const p of Object.keys(schedule)) {
    schedule[p].sort((a, b) => (a.time ?? "00:00").localeCompare(b.time ?? "00:00"));
  }

  return {
    schedule,
    meta: {
      personalizationLevel,
      basedOn,
      generatedAt:       new Date().toISOString(),
      elapsedMs:         Date.now() - t0,
      todayRoutineCount: routinesToday.length,
      microActivities:   slotsWithMicro.filter(s => s.isMicro).length,
      interactionCount,
    },
  };
}
