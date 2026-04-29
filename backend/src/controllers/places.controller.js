/**
 * places.controller.js — HTTP handlers for the /api/places resource.
 *
 * GET /api/places/:id
 *   Returns full place details from Google Places API (or Firestore fallback).
 *   The response includes real reviews, opening hours, photos, and coordinates.
 *
 * GET /api/places/:id/photo?ref=<photoReference>&w=<maxWidth>
 *   Resolves a Google Place Photo reference to a CDN URL server-side so the
 *   API key is never exposed to the mobile client.
 */

import { getPlaceDetails, resolvePhotoUrl }     from "../services/googlePlaces.service.js";
import { getPlaceById }                         from "../services/place.service.js";
import { logger }                               from "../utils/logger.js";
import { buildPlacePhotoPaths }                from "../utils/placePhotoPaths.js";

/**
 * GET /api/places/:id
 *
 * 1. If GOOGLE_MAPS_API_KEY is set, tries Google Place Details first.
 * 2. Falls back to Firestore if Google fails or key is absent.
 * 3. Returns 404 when neither source has the place.
 */
export const getPlaceHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // ── Try Google Place Details ──────────────────────────────────────────────
    const googleDetails = await getPlaceDetails(id);
    if (googleDetails) {
      return res.json({ status: "ok", data: googleDetails });
    }

    // ── Fallback: Firestore ───────────────────────────────────────────────────
    const firestorePlace = await getPlaceById(id);
    if (firestorePlace) {
      const fid  = firestorePlace.id ?? id;
      const refs = firestorePlace.photoReferences ?? [];
      const images = Array.isArray(firestorePlace.images) && firestorePlace.images.length
        ? firestorePlace.images.slice(0, 5)
        : buildPlacePhotoPaths(fid, refs, 400, 5);
      return res.json({
        status: "ok",
        data: { ...firestorePlace, id: fid, source: "firestore", images },
      });
    }

    return res.status(404).json({ status: "error", message: "Place not found" });
  } catch (err) {
    logger.error("[places] getPlaceHandler error:", { message: err.message });
    next(err);
  }
};

/**
 * GET /api/places/:id/photo?ref=<photoReference>&w=<maxWidth>
 *
 * Resolves a Google Place Photo reference to its actual CDN URL and redirects
 * the client there. This keeps the Google API key server-side only.
 *
 * Query params:
 *   ref {string} — Google photo_reference string (required)
 *   w   {number} — max width in pixels (default 800, capped at 1600)
 */
export const getPlacePhotoHandler = async (req, res, next) => {
  try {
    const { ref } = req.query;
    if (!ref) {
      return res.status(400).json({ status: "error", message: "ref query param is required" });
    }

    const maxWidth = Math.min(1600, Math.max(100, parseInt(req.query.w ?? "800", 10) || 800));
    const photoUrl = await resolvePhotoUrl(ref, maxWidth);

    if (!photoUrl) {
      return res.status(502).json({ status: "error", message: "Could not resolve photo URL" });
    }

    // Redirect the mobile client straight to the Google CDN image.
    res.redirect(302, photoUrl);
  } catch (err) {
    logger.error("[places] getPlacePhotoHandler error:", { message: err.message });
    next(err);
  }
};
