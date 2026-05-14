/**
 * Client-side pricing visibility helpers.
 * Mirrors backend/Wuloye-/src/utils/pricing.utils.js resolvePricingEligibility.
 * Used when navigating to details from stale payloads or Places API-only data.
 */

const HARD_OFF_TYPES = new Set([
    "church", "mosque", "worship", "prayer", "chapel", "cathedral",
    "synagogue", "shrine", "temple", "hindu_temple", "park", "plaza", "monument", "cemetery",
    "memorial", "playground", "hiking", "trail", "walking", "viewpoint",
    "lookout", "bridge", "town_square", "public_space",
]);

const LIBRARY_TYPES = new Set(["library"]);
const SOFT_OFF_OUTDOOR = new Set(["outdoor"]);

const HARD_ON_TYPES = new Set([
    "coffee", "cafe", "restaurant", "bakery", "bar", "lounge", "hotel",
    "lodge", "guesthouse", "gym", "yoga", "fitness", "spa", "cinema",
    "club", "music", "shop", "shopping", "mall", "market", "taxi",
    "workspace", "coworking", "office", "museum", "gallery", "art",
    "theater", "stadium", "sports", "event", "events", "concert", "social",
]);

const FREE_PHRASE_RE = /\b(?:free\s+entry|volunteer|public\s+(?:park|library|gathering)|community\s+(?:center|centre))\b/i;
const PAID_RE = /\b(?:ticket|coworking|membership|reservation\b|booking\b|buffet|admission|day\s*pass)\b/i;

function normType(place) {
    let t = place?.type || place?.category || "";
    if (typeof t !== "string") t = String(t || "");
    return t.trim().toLowerCase().replace(/\s+/g, "_");
}

function blob(place) {
    const parts = [
        place?.name,
        place?.description,
        place?.summary,
        place?.address,
        place?.vicinity,
        ...(Array.isArray(place?.tags) ? place.tags : []),
    ];
    return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Fallback when `pricingEnabled` is missing from payload (Places API-only).
 */
export function inferPricingEligible(place) {
    if (!place || typeof place !== "object") return false;
    const ptype = normType(place);
    const text = blob(place);

    if (HARD_OFF_TYPES.has(ptype)) return false;
    if (LIBRARY_TYPES.has(ptype) || /\blibrary\b/.test(text)) {
        if (PAID_RE.test(text) || text.includes("cafe") || text.includes("coworking"))
            return true;
        return false;
    }
    if (SOFT_OFF_OUTDOOR.has(ptype)) return false;
    if (["event", "events", "concert"].includes(ptype))
        return PAID_RE.test(text) || /ticket|festival|conference/.test(text);
    if (HARD_ON_TYPES.has(ptype)) return true;
    if (FREE_PHRASE_RE.test(text)) return false;
    if (PAID_RE.test(text)) return true;
    return false;
}

/**
 * Prefer explicit backend / AI flags; infer only when unspecified.
 */
export function effectivePricingEnabled(place) {
    if (typeof place?.pricingEnabled === "boolean") {
        return place.pricingEnabled;
    }
    return inferPricingEligible(place);
}
