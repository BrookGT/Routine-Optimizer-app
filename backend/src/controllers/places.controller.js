/**
 * places.controller.js — HTTP handlers for the /api/places resource.
 *
 * GET /api/places/:id
 *   Returns full place details from Google Places API (or Firestore fallback).
 *   The response includes real reviews, opening hours, photos, and coordinates.
 *
 * GET /api/places/:id/photo?ref=<photoReference>&w=<maxWidth>
 *   Streams JPEG/WebP bytes (HTTP 200) after fetching from Google server-side.
 *   No 302 to the client — avoids React Native Image + redirect issues.
 */

import {
  getPlaceDetails,
  fetchPlacePhotoBuffer,
} from "../services/googlePlaces.service.js";
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
 * Streams image bytes (200). Photo route is unauthenticated: photo_reference
 * is an unguessable capability token; rate-limiting still applies.
 */
export const getPlacePhotoHandler = async (req, res, next) => {
  try {
    const { ref } = req.query;
    if (!ref) {
      return res.status(400).json({ status: "error", message: "ref query param is required" });
    }

    const maxWidth = Math.min(1600, Math.max(100, parseInt(req.query.w ?? "800", 10) || 800));
    const result = await fetchPlacePhotoBuffer(ref, maxWidth);

    if (!result) {
      return res.status(502).json({ status: "error", message: "Could not load photo" });
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).send(result.buffer);
  } catch (err) {
    logger.error("[places] getPlacePhotoHandler error:", { message: err.message });
    next(err);
  }
};
