import { enrichPlaceLocation } from "./placeLocation";
import { deriveDiscoverCategory } from "./discoverCategory";

/**
 * Normalise recommendation API items for PlaceCard / lists.
 *
 * @param {object} item      — raw recommendation item from backend
 * @param {number} index     — position in list (used for fallback id)
 * @param {object} [meta]    — optional recommendation meta (meta.ai, meta.topInterestType, etc.)
 */
export function normalisePlace(item, index, meta = null) {
    const id =
        item?.placeId ??
        item?.id ??
        item?.googlePlaceId ??
        `${item?.name ?? "place"}-${index}`;

    const numericScore =
        typeof item?.finalScore === "number"
            ? item.finalScore
            : typeof item?.score === "number"
              ? item.score
              : null;

    const score =
        typeof numericScore === "number"
            ? `${Math.max(1, Math.min(99, Math.round(numericScore)))}% match`
            : (item?.scoreLabel ?? "Top pick");

    const distance =
        item?.distanceText ??
        item?.distance ??
        (typeof item?.distanceKm === "number"
            ? `${item.distanceKm.toFixed(1)} km away`
            : "Nearby");

    // ── AI insight: "Recommended because you like gym" ─────────────────────
    const placeType      = item?.type ?? item?.category ?? "";
    const predictedType  = item?.predictedType ?? meta?.ai?.predictedType ?? null;
    const topInterest    = meta?.topInterestType ?? null;
    const sessionIntent  = meta?.session?.sessionIntent ?? meta?.detectedIntent ?? null;

    let aiInsight = null;
    if (predictedType && placeType.toLowerCase() === predictedType.toLowerCase()) {
        const label = predictedType.charAt(0).toUpperCase() + predictedType.slice(1);
        aiInsight = `AI predicted: you'll want ${label} next`;
    } else if (topInterest && placeType.toLowerCase() === topInterest.toLowerCase()) {
        const label = topInterest.charAt(0).toUpperCase() + topInterest.slice(1);
        aiInsight = `Matches your top interest — ${label}`;
    } else if (sessionIntent && placeType.toLowerCase() === sessionIntent.toLowerCase()) {
        const label = sessionIntent.charAt(0).toUpperCase() + sessionIntent.slice(1);
        aiInsight = `Fits your current ${label} session`;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Normalise images: prefer explicit images[], fall back to single image string.
    const rawImages = Array.isArray(item?.images) && item.images.length > 0
        ? item.images
        : item?.image && typeof item.image === "string" && item.image.trim()
          ? [item.image.trim()]
          : [];
    const images = rawImages.filter(Boolean);

    // ── AI enrichment (price + LLM reason + personalization matches) ───────
    // These fields come from the Python AI service via the backend response.
    const priceLevel    = item?.pricingEnabled === true ? (item?.priceLevel ?? null) : null;
    const estimatedCost = item?.pricingEnabled === true ? (item?.estimatedCost ?? null) : null;
    const priceCategory = item?.pricingEnabled === true ? (item?.priceCategory ?? null) : null;
    const priceSignals  = item?.pricingEnabled === true ? (item?.priceSignals ?? null) : null;
    const pricingEnabled = item?.pricingEnabled === true;
    const pricingReason  = item?.pricingReason ?? null;
    const reason        = item?.reason        ?? null;
    const budgetFit     = typeof item?.budgetFit === "boolean" ? item.budgetFit : null;
    const matches       = item?.matches       ?? null;   // { budget: bool, religion: bool }

    const category = deriveDiscoverCategory({
        ...item,
        id,
        placeId: id,
    });

    const base = {
        ...item,
        id,
        placeId: id,
        category,
        type: placeType || "Place",
        name: item?.name ?? "Recommended place",
        description:
            item?.description ??
            item?.summary ??
            "Curated place recommendation for you.",
        score,
        distance,
        aiInsight,
        // AI enrichment fields are surfaced as first-class so PlaceDetail/PlaceCard
        // can render them without re-checking the source object.
        priceLevel,
        estimatedCost,
        priceCategory,
        priceSignals,
        pricingEnabled,
        pricingReason,
        reason,
        budgetFit,
        matches,
        images,
    };

    return enrichPlaceLocation(base, index);
}
