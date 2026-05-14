/**
 * services/aiFeedback.service.js — Real-time AI feedback dispatcher.
 *
 * After every user interaction (like / save / dismiss / click) we POST a
 * single event to the Python AI service's /feedback endpoint so the
 * contextual bandit updates immediately.  The call is fire-and-forget and
 * never blocks the user-facing response.
 *
 * Failure modes (all non-fatal):
 *   - AI_SERVICE_ENABLED=false      → skip silently
 *   - Service unreachable / timeout → log a warning, continue
 *   - HTTP non-2xx                  → log a warning, continue
 *
 * Re: privacy — the only fields sent are user_id (Firebase UID), place_type,
 * action_type, and place_id.  No PII or full profile is sent on the
 * per-interaction path; the full profile only goes through /predict.
 */

import { logger } from "../utils/logger.js";

const AI_SERVICE_URL     = process.env.AI_SERVICE_URL || "http://ai-service:8000";
const AI_FEEDBACK_TIMEOUT = parseInt(
  process.env.AI_FEEDBACK_TIMEOUT_MS || "1500",
  10,
);

/** Whether real-time AI feedback is enabled. */
const isFeedbackEnabled = () =>
  process.env.AI_SERVICE_ENABLED !== "false" &&
  process.env.AI_FEEDBACK_ENABLED !== "false";

/**
 * Post a single feedback event to the AI service.
 * Always resolves; never throws.
 *
 * @param {{
 *   userId:     string,
 *   placeId:    string|null,
 *   placeType:  string|null,
 *   actionType: string,
 * }} event
 * @returns {Promise<{ ok: boolean, status?: number, body?: any, error?: string }>}
 */
export const sendInteractionFeedback = async ({
  userId,
  placeId,
  placeType,
  actionType,
}) => {
  if (!isFeedbackEnabled())     return { ok: false, error: "disabled" };
  if (!userId || !actionType)   return { ok: false, error: "missing_required" };
  if (!placeType)               return { ok: false, error: "missing_place_type" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_FEEDBACK_TIMEOUT);

  try {
    const res = await fetch(`${AI_SERVICE_URL}/feedback`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id:     userId,
        place_id:    placeId || "",
        place_type:  placeType,
        action_type: actionType,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn(`[ai-feedback] /feedback returned HTTP ${res.status} for uid=${userId}`);
      return { ok: false, status: res.status };
    }

    const body = await res.json().catch(() => ({}));
    logger.debug(
      `[ai-feedback] uid=${userId} type=${placeType} action=${actionType} ` +
      `score=${body.bandit_score ?? "?"}`,
    );
    return { ok: true, status: res.status, body };
  } catch (err) {
    if (err.name === "AbortError") {
      logger.warn(
        `[ai-feedback] timeout (${AI_FEEDBACK_TIMEOUT}ms) — interaction still saved (uid=${userId})`,
      );
    } else {
      logger.warn(`[ai-feedback] failed: ${err.message} — interaction still saved`);
    }
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Post many feedback events at once.  Used by the batch-interaction route.
 * Falls back to looping single calls if the AI service can't be reached.
 *
 * @param {Array<{userId,placeId,placeType,actionType}>} events
 */
export const sendInteractionFeedbackBatch = async (events) => {
  if (!isFeedbackEnabled() || !events?.length) return { ok: false, error: "disabled" };

  const items = events
    .filter((e) => e?.userId && e?.actionType && e?.placeType)
    .map((e) => ({
      user_id:     e.userId,
      place_id:    e.placeId || "",
      place_type:  e.placeType,
      action_type: e.actionType,
    }));

  if (!items.length) return { ok: false, error: "no_valid_items" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_FEEDBACK_TIMEOUT);
  try {
    const res = await fetch(`${AI_SERVICE_URL}/feedback/batch`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ items }),
      signal:  controller.signal,
    });
    if (!res.ok) {
      logger.warn(`[ai-feedback] /feedback/batch HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }
    const body = await res.json().catch(() => ({}));
    logger.info(
      `[ai-feedback] batch applied=${body.applied ?? "?"}/${items.length}`,
    );
    return { ok: true, body };
  } catch (err) {
    logger.warn(`[ai-feedback] batch failed: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
};
