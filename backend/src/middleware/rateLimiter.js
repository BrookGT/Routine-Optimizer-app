/**
 * middleware/rateLimiter.js — Phase 18 request throttling
 *
 * Two rate limiters from express-rate-limit:
 *
 *   globalLimiter  — broad IP-level cap; blocks bulk scrapers / DDoS.
 *                    Applied globally in app.js above all routes.
 *                    Default max is higher in non-production (see DEFAULT_GLOBAL_MAX).
 *
 *   authLimiter    — tighter per-IP cap for authenticated resource-heavy routes
 *                    (recommendations, interactions, routines).
 *                    Applied per-router in the respective route files.
 *
 * All limits are configurable via environment variables so they can be tuned
 * per deployment without a code change.
 *
 * Both return the standard project JSON envelope on 429 so clients handle
 * them the same way as other errors.
 */

import rateLimit from "express-rate-limit";

const WINDOW_MS     = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "900000", 10); // 15 min
// In development, default is higher so hot reload, retries, and many /places calls do not hit 429 as easily.
const DEFAULT_GLOBAL_MAX = process.env.NODE_ENV === "production" ? 300 : 2000;
const GLOBAL_MAX    = parseInt(process.env.RATE_LIMIT_GLOBAL_MAX ?? String(DEFAULT_GLOBAL_MAX), 10);
const AUTH_MAX      = parseInt(process.env.RATE_LIMIT_AUTH_MAX   ?? "60",    10); // 60 req / 1 min

/**
 * Global limiter: default 300 req / window in production, 2000 in development
 * (override with RATE_LIMIT_GLOBAL_MAX). Mounted in app.js before any routes.
 */
export const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max:      GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) =>
    res.status(429).json({ success: false, data: null, message: "Too many requests — please slow down" }),
});

/**
 * Auth limiter: 60 requests per 1 minute per IP.
 * Mounted on recommend / interactions / routines routes.
 */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  max:      AUTH_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) =>
    res.status(429).json({ success: false, data: null, message: "Too many requests — please slow down" }),
});
