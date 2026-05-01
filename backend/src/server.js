/**
 * server.js — Entry point
 *
 * Responsibility: load environment variables, register process-level safety
 * guards, and start the HTTP server.  All Express configuration lives in
 * app.js to keep this file minimal and to make the app easily importable in
 * tests without binding to a port.
 */

import "dotenv/config";
import { logger } from "./utils/logger.js";
import app from "./app.js";
import { recordsMetricsPeriodically } from "./middleware/metrics.js";
import { startScrapeScheduler } from "./jobs/scrapeEvents.js";

// ─── Process-level safety guards (Phase 18) ───────────────────────────────────
// Catches any exception that escapes all try/catch blocks.  Logs it, then
// exits so the process manager (Docker, PM2, systemd) can restart cleanly.
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException — shutting down", { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection — shutting down", { reason: String(reason) });
  process.exit(1);
});

// ─── HTTP server ──────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`[server] Wuloye backend running on port ${PORT} (${process.env.NODE_ENV ?? "development"})`);
});

// Log in-process metrics every 60 s (Phase 18 monitoring).
recordsMetricsPeriodically(60_000);

// Start background event scraping scheduler.
startScrapeScheduler().catch((err) =>
  logger.warn(`[server] Scrape scheduler init failed: ${err.message}`)
);
