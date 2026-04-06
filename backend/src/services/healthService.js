/**
 * services/healthService.js — Phase 18 readiness-aware health check
 *
 * Performs a lightweight Firestore connectivity probe on every call so that
 * load-balancers and health monitors can distinguish:
 *
 *   status "ok"       — service is live AND Firestore is reachable  → HTTP 200
 *   status "degraded" — service is live BUT Firestore is unreachable → HTTP 503
 *
 * The probe uses a limit(1) read on a "_health" collection (documents need not
 * exist — the round-trip itself confirms connectivity).
 */

/**
 * @returns {Promise<{
 *   status: "ok"|"degraded",
 *   timestamp: string,
 *   environment: string,
 *   dependencies: { firestore: "connected"|"unreachable" }
 * }>}
 */
export const getHealthStatus = async () => {
  let firestoreOk = false;
  try {
    const { db } = await import("../config/firebase.js");
    if (db) {
      await db.collection("_health").limit(1).get();
      firestoreOk = true;
    }
  } catch {
    /* non-fatal — we report degraded status instead of throwing */
  }

  return {
    status:      firestoreOk ? "ok" : "degraded",
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
    dependencies: {
      firestore: firestoreOk ? "connected" : "unreachable",
    },
  };
};
