/**
 * scripts/reset-system.js — Hard system reset for clean-state validation.
 *
 * What this script does:
 *   1. Wipe every document in the Firestore `interactions` collection.
 *   2. Wipe every document in the Firestore `routines` collection.
 *   3. Reset learning fields on every user profile:
 *        typeAffinity → {}
 *        seenPlaces   → []
 *        embedding    → {}
 *      (uid, email, name, createdAt, and all onboarding fields are preserved)
 *   4. Delete the Firestore `models/current` document (backend Node model).
 *   5. Delete backend/data/model.json (file backup of Node model).
 *   6. Call AI service POST /reset to wipe Python model artefacts.
 *
 * Usage:
 *   npm run reset:system
 *   node scripts/reset-system.js
 *
 * Options (env vars):
 *   AI_SERVICE_URL=http://localhost:8000   (default)
 *   DRY_RUN=true                           print what would happen, do nothing
 */

import "dotenv/config";
import admin from "firebase-admin";
import { existsSync, unlinkSync } from "fs";
import { fileURLToPath }          from "url";
import { dirname, join }          from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const DRY_RUN        = process.env.DRY_RUN === "true";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const MODEL_FILE = join(__dirname, "..", "data", "model.json");

// ─── Firebase init ────────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const log = (...args) => console.log("[reset]", ...args);
const warn = (...args) => console.warn("[reset] WARN:", ...args);

/**
 * Deletes all documents in a Firestore collection in batches of 400.
 * @param {string} collectionName
 * @returns {Promise<number>} total deleted count
 */
async function deleteCollection(collectionName) {
  let total = 0;
  let query = db.collection(collectionName).limit(400);

  while (true) {
    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));

    if (!DRY_RUN) {
      await batch.commit();
    }

    total += snap.size;
    log(`  deleted ${snap.size} docs from ${collectionName} (total so far: ${total})`);
  }

  return total;
}

/**
 * Resets all learning fields on every user profile document.
 * Preserves: uid, email, name, createdAt, interests, budgetRange,
 *            locationPreference, sleepTime, wakeTime, weeklyActivities,
 *            mealPreferences, weeklyBudget, updatedAt.
 * @returns {Promise<number>} count of profiles reset
 */
async function resetProfiles() {
  const snap = await db.collection("users").get();
  if (snap.empty) {
    log("  no user profiles found");
    return 0;
  }

  const BATCH_SIZE = 400;
  let idx = 0;

  while (idx < snap.docs.length) {
    const batch = db.batch();
    const slice = snap.docs.slice(idx, idx + BATCH_SIZE);

    for (const doc of slice) {
      if (!DRY_RUN) {
        batch.update(doc.ref, {
          typeAffinity: {},
          seenPlaces:   [],
          embedding:    {},
          updatedAt:    new Date().toISOString(),
        });
      }
    }

    if (!DRY_RUN) await batch.commit();

    idx += BATCH_SIZE;
  }

  return snap.size;
}

/**
 * Deletes the Firestore models/current document.
 */
async function resetFirestoreModel() {
  const ref = db.collection("models").doc("current");
  const snap = await ref.get();
  if (snap.exists) {
    if (!DRY_RUN) await ref.delete();
    log("  deleted Firestore models/current");
  } else {
    log("  models/current does not exist — skipping");
  }
}

/**
 * Calls AI service POST /reset.
 */
async function resetAiService() {
  const url = `${AI_SERVICE_URL}/reset`;
  log(`  calling ${url} ...`);

  if (DRY_RUN) {
    log("  [DRY_RUN] would call POST /reset on AI service");
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      warn(`AI service returned HTTP ${res.status} — artefacts may still exist on disk`);
      return;
    }

    const body = await res.json();
    log(
      `  AI service reset: ${body.message ?? "OK"} | deleted: [${(body.deleted_files ?? []).join(", ")}]`
    );
  } catch (err) {
    warn(
      `AI service unreachable (${err.message}). ` +
      `Start the AI service and run: curl -X POST ${AI_SERVICE_URL}/reset`
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log(" Wuloye System Reset");
  if (DRY_RUN) console.log(" MODE: DRY RUN — no changes will be made");
  console.log("=".repeat(60));

  // 1. Interactions
  log("Step 1: Wiping interactions collection …");
  const iCount = await deleteCollection("interactions");
  log(`  done — ${iCount} interaction(s) removed`);

  // 2. Routines
  log("Step 2: Wiping routines collection …");
  const rCount = await deleteCollection("routines");
  log(`  done — ${rCount} routine(s) removed`);

  // 3. Profiles — reset learning fields only
  log("Step 3: Resetting user profiles (typeAffinity, seenPlaces, embedding) …");
  const pCount = await resetProfiles();
  log(`  done — ${pCount} profile(s) reset`);

  // 4. Firestore Node model
  log("Step 4: Clearing Firestore model …");
  await resetFirestoreModel();

  // 5. File model backup
  log("Step 5: Deleting backend/data/model.json …");
  if (existsSync(MODEL_FILE)) {
    if (!DRY_RUN) unlinkSync(MODEL_FILE);
    log("  deleted model.json");
  } else {
    log("  model.json not found — already clean");
  }

  // 6. AI service reset
  log("Step 6: Resetting AI service artefacts …");
  await resetAiService();

  console.log("=".repeat(60));
  console.log(" Reset complete.");
  console.log(" System is now in a clean cold-start state.");
  console.log(" Next: sign in with a fresh user and start interacting.");
  console.log("=".repeat(60));

  process.exit(0);
}

main().catch((err) => {
  console.error("[reset] FATAL:", err.message);
  process.exit(1);
});
