/**
 * Builds relative API paths for place photos (auth-required; mobile prepends API base + Bearer).
 *
 * @param {string} placeId
 * @param {string[]} photoReferences — Google photo_reference values
 * @param {number} [maxWidth=400]
 * @param {number} [maxCount=5]
 * @returns {string[]} e.g. ["/places/ChIJ.../photo?ref=...&w=400"]
 */
export function buildPlacePhotoPaths(placeId, photoReferences, maxWidth = 400, maxCount = 5) {
  if (!placeId || !Array.isArray(photoReferences)) return [];
  return photoReferences
    .filter(Boolean)
    .slice(0, maxCount)
    .map(
      (ref) =>
        `/places/${encodeURIComponent(placeId)}/photo?ref=${encodeURIComponent(ref)}&w=${maxWidth}`,
    );
}
