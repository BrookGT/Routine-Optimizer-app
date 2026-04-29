import apiClient from "./client";

/**
 * Fetches full place details from the backend (Google Places → Firestore fallback).
 *
 * @param {string} placeId — Google place_id or Firestore document ID
 * @returns {Promise<object>} place details including reviews, hours, photos, coords
 */
export async function getPlaceDetails(placeId) {
    const { data } = await apiClient.get(`/places/${encodeURIComponent(placeId)}`);
    return data;
}

/**
 * Returns a fully-resolved URL for a Google Place photo.
 * The backend proxies the request so the API key stays server-side.
 *
 * @param {string} placeId        — place_id (used for the route path)
 * @param {string} photoReference — photo_reference from Place Details
 * @param {number} [maxWidth=800]
 * @returns {string} URL that will 302-redirect to the actual image
 */
export function getPlacePhotoUrl(placeId, photoReference, maxWidth = 800) {
    const base = apiClient.defaults.baseURL ?? "";
    return `${base}/places/${encodeURIComponent(placeId)}/photo?ref=${encodeURIComponent(photoReference)}&w=${maxWidth}`;
}
