/**
 * Canonical Discover filter keys ↔ internal place.type values used in catalogue + Google mappings.
 * Keep in sync with mobile `src/utils/discoverCategory.js`.
 */

const CANON_KEYS = new Set([
  "gym",
  "cafe",
  "hotel",
  "sports",
  "event",
  "church",
  "workspace",
]);

const ALIAS_TO_CANON = Object.freeze({
  events:     "event",
  cafes:      "cafe",
  coffees:    "cafe",
  restaurants: "cafe",
  gyms:       "gym",
  hotels:     "hotel",
  sport:      "sports",
  workspaces: "workspace",
  office:     "workspace",
  coworking:  "workspace",
});

/**
 * Map canonical discover key → allowed exact `place.type` values (lowercase).
 */
const CANON_TO_INTERNAL_TYPES = Object.freeze({
  gym:       new Set(["gym"]),
  cafe:      new Set(["coffee", "restaurant"]),
  hotel:     new Set(["hotel"]),
  sports:    new Set(["sports"]),
  church:    new Set(["church"]),
  workspace: new Set(["study"]),
  event:     new Set(), // places pipeline must not return events
});

/**
 * @param {string|string[]|null|undefined} typeFilter
 * @returns {string|null}
 */
export function normalizeDiscoverFilterKey(typeFilter) {
  if (typeFilter == null) return null;
  const raw = Array.isArray(typeFilter) ? typeFilter[0] : typeFilter;
  const k = String(raw).trim().toLowerCase();
  if (!k) return null;
  const canon = ALIAS_TO_CANON[k] ?? k;
  return CANON_KEYS.has(canon) ? canon : null;
}

/**
 * @param {string|null} canon
 * @returns {Set<string>|null}  null = do not apply type filter
 */
export function getAllowedInternalTypesForDiscover(canon) {
  if (!canon) return null;
  return CANON_TO_INTERNAL_TYPES[canon] ?? null;
}

/**
 * Strict match: `place.type` must be one of the internal types for the discover chip.
 * @param {object} place
 * @param {string} discoverKey — canonical key (gym, cafe, …)
 */
export function placeMatchesDiscoverKey(place, discoverKey) {
  if (!discoverKey) return true;
  const allowed = getAllowedInternalTypesForDiscover(discoverKey);
  if (allowed == null) return false;
  const t = String(place?.type ?? "").toLowerCase();
  return allowed.has(t);
}

/**
 * Parse query params: canonical discover key vs legacy type string(s).
 * When the request matches a Discover chip, only `discoverKey` is set (strict path).
 * Otherwise `legacyTypeFilter` preserves ?type= / ?types= for exact internal-type matching.
 *
 * @returns {{ discoverKey: string|null, legacyTypeFilter: string|string[]|null }}
 */
export function resolveDiscoverFilter(rawCategory, rawType, rawTypes) {
  let typeFilter = null;
  if (rawTypes) {
    const list = String(rawTypes)
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    typeFilter = list.length > 0 ? list : null;
  } else if (rawType) {
    typeFilter = String(rawType).trim().toLowerCase() || null;
  } else if (rawCategory) {
    typeFilter = String(rawCategory).trim().toLowerCase() || null;
  }

  const discoverKey = normalizeDiscoverFilterKey(typeFilter);
  const legacyTypeFilter = discoverKey != null ? null : typeFilter;

  return { discoverKey, legacyTypeFilter };
}
