/**
 * discoverCategory.js — Maps Discover tab filters to place/event matching rules.
 *
 * Mobile sends ?category=gym or ?type=gym (synonyms: GYM, fitness, workspaces).
 */

/** @typedef {'gym'|'cafe'|'church'|'events'|'workspace'} DiscoverCategoryKey */

const CANONICAL = new Set(["gym", "cafe", "church", "events", "workspace"]);

/** Maps aliases only — not generic API types like `restaurant` (those stay legacy filters). */
const SYNONYMS = {
  gym: "gym",
  fitness: "gym",

  cafe: "cafe",
  coffee: "cafe",

  church: "church",
  religious: "church",

  events: "events",
  event: "events",

  workspace: "workspace",
  workspaces: "workspace",
  coworking: "workspace",
};

/**
 * @param {string|null|undefined} raw
 * @returns {DiscoverCategoryKey|null}
 */
export function normalizeDiscoverCategory(raw) {
  if (raw == null || typeof raw !== "string") return null;
  const k = raw.trim();
  if (!k) return null;
  const lower = k.toLowerCase();
  if (SYNONYMS[lower]) return SYNONYMS[lower];
  return CANONICAL.has(lower) ? /** @type {DiscoverCategoryKey} */ (lower) : null;
}

/**
 * Parse query params: category wins over type; supports legacy multi-type.
 *
 * @returns {{ discoverKey: DiscoverCategoryKey|null, legacyTypeFilter: string|string[]|null }}
 */
export function resolveDiscoverFilter(rawCategory, rawType, rawTypes) {
  const firstMulti = rawTypes
    ? rawTypes.split(",").map((t) => t.trim()).filter(Boolean)[0]
    : null;
  const primary = (rawCategory ?? rawType ?? firstMulti ?? "").trim();
  if (!primary) return { discoverKey: null, legacyTypeFilter: null };

  const dk = normalizeDiscoverCategory(primary);
  if (dk) return { discoverKey: dk, legacyTypeFilter: null };

  if (rawTypes) {
    const list = rawTypes.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    return { discoverKey: null, legacyTypeFilter: list.length ? list : null };
  }
  return { discoverKey: null, legacyTypeFilter: primary.toLowerCase() };
}

/**
 * @param {object} place
 * @param {DiscoverCategoryKey} discoverKey
 */
/** Internal place types that can never count as a church result (Google often lists many secondary types). */
const CHURCH_EXCLUDED_TYPES = new Set([
  "gym", "yoga", "coffee", "restaurant", "social", "park", "walk", "outdoor", "study", "hotel",
]);

/** Google / normalised tags that indicate a worship venue (exact-ish type strings). */
const WORSHIP_PLACE_TAGS = new Set([
  "place_of_worship",
  "church",
  "mosque",
  "synagogue",
  "hindu_temple",
]);

/** Work-space filter: never treat these primary types as workspaces. */
const WORKSPACE_EXCLUDED_TYPES = new Set([
  "gym", "yoga", "church", "restaurant", "social", "park", "walk", "outdoor",
]);

function hasWorshipPlaceTag(place) {
  if (!Array.isArray(place?.tags)) return false;
  return place.tags.some((raw) => {
    const t = String(raw).toLowerCase();
    if (WORSHIP_PLACE_TAGS.has(t)) return true;
    for (const w of WORSHIP_PLACE_TAGS) {
      if (t === w || t.endsWith(`_${w}`) || t.startsWith(`${w}_`)) return true;
    }
    return false;
  });
}

export function placeMatchesDiscoverKey(place, discoverKey) {
  const type = String(place?.type ?? "").toLowerCase();
  const cat = String(place?.category ?? "").toLowerCase();
  const tags = Array.isArray(place?.tags) ? place.tags.join(" ").toLowerCase() : "";
  const name = String(place?.name ?? "").toLowerCase();
  const blob = `${type} ${cat} ${tags} ${name}`;

  switch (discoverKey) {
    case "gym":
      return (
        ["gym", "yoga"].includes(type) ||
        /\b(crossfit|fitness|weights|hiit)\b/.test(blob)
      );
    case "cafe":
      return (
        ["coffee", "restaurant", "social", "hotel"].includes(type) ||
        /\b(cafe|coffee|restaurant|brunch|bakery|bistro|dining|hotel|bar)\b/.test(blob)
      );
    case "church": {
      if (CHURCH_EXCLUDED_TYPES.has(type)) return false;
      if (type === "church") return true;
      if (!hasWorshipPlaceTag(place)) return false;
      return true;
    }
    case "workspace": {
      if (WORKSPACE_EXCLUDED_TYPES.has(type)) return false;
      if (type === "study" || type === "hotel") return true;
      const bundle = `${name} ${tags}`;
      return /\b(cowork|co-work|workspace|wifi|laptop|study-friendly|work-friendly|remote work)\b/.test(bundle);
    }
    default:
      return true;
  }
}

/**
 * Upcoming scraped events relevant to the Church discover filter.
 */
export function eventMatchesChurchDiscover(ev) {
  const c = String(ev?.category ?? "").toLowerCase();
  if (c === "church") return true;
  const text = `${ev?.title ?? ""} ${ev?.description ?? ""}`.toLowerCase();
  return /\b(church|worship|prayer|gospel|mass|liturgy|sermon|cathedral)\b/.test(text);
}
