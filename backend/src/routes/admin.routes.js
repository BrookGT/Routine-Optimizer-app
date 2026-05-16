/**
 * admin.routes.js — Admin-only management routes.
 *
 * All routes require authenticate + requireAdmin middleware.
 *
 * Mounted at: /api/admin
 */

import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import {
  getAllUsers,
  getUserById,
  setSuspendedStatus,
  deleteUserById,
} from "../services/user.service.js";
import {
  getAllPlaces,
  getPlaceById,
  createPlace,
  updatePlace,
  deletePlaceById,
  VALID_TYPES,
  VALID_PRICE_RANGES,
} from "../services/place.service.js";
import { db } from "../config/firebase.js";
import { logger } from "../utils/logger.js";

const router = Router();

// Apply auth to every route in this file.
router.use(authenticate, requireAdmin);

// ─── Verify ──────────────────────────────────────────────────────────────────

router.get("/verify", (req, res) => {
  return res.status(200).json({
    success: true,
    data: { uid: req.user.uid, email: req.user.email ?? null },
    message: "Admin verified",
  });
});

// ─── User management ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Query: limit, startAfter
 */
router.get("/users", async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const startAfter = req.query.startAfter || null;
    const result = await getAllUsers({ limit, startAfter });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users/:uid
 */
router.get("/users/:uid", async (req, res, next) => {
  try {
    const user = await getUserById(req.params.uid);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:uid/suspend
 * Body: { suspended: boolean }
 */
router.patch("/users/:uid/suspend", async (req, res, next) => {
  try {
    const { suspended } = req.body;
    if (typeof suspended !== "boolean") {
      return res.status(400).json({ success: false, message: "`suspended` must be a boolean" });
    }
    const user = await setSuspendedStatus(req.params.uid, suspended);
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/users/:uid
 */
router.delete("/users/:uid", async (req, res, next) => {
  try {
    await deleteUserById(req.params.uid);
    return res.status(200).json({ success: true, message: "User deleted" });
  } catch (err) {
    next(err);
  }
});

// ─── Places management ───────────────────────────────────────────────────────

/**
 * GET /api/admin/places
 */
router.get("/places", async (req, res, next) => {
  try {
    const places = await getAllPlaces();
    return res.status(200).json({ success: true, data: places, total: places.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/places/meta
 * Returns allowed types and price ranges for form validation.
 */
router.get("/places/meta", (req, res) => {
  return res.status(200).json({
    success: true,
    data: { types: VALID_TYPES, priceRanges: VALID_PRICE_RANGES },
  });
});

/**
 * GET /api/admin/places/:id
 */
router.get("/places/:id", async (req, res, next) => {
  try {
    const place = await getPlaceById(req.params.id);
    if (!place) {
      return res.status(404).json({ success: false, message: "Place not found" });
    }
    return res.status(200).json({ success: true, data: place });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/places
 */
router.post("/places", async (req, res, next) => {
  try {
    const place = await createPlace(req.body);
    return res.status(201).json({ success: true, data: place });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/places/:id
 */
router.put("/places/:id", async (req, res, next) => {
  try {
    const place = await updatePlace(req.params.id, req.body);
    return res.status(200).json({ success: true, data: place });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/places/:id
 */
router.delete("/places/:id", async (req, res, next) => {
  try {
    await deletePlaceById(req.params.id);
    return res.status(200).json({ success: true, message: "Place deleted" });
  } catch (err) {
    next(err);
  }
});

// ─── Analytics ───────────────────────────────────────────────────────────────

/**
 * GET /api/admin/analytics
 * Returns platform-wide aggregated analytics.
 */
router.get("/analytics", async (req, res, next) => {
  try {
    const [usersSnap, interactionsSnap, placesSnap, eventsSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("interactions").count().get(),
      db.collection("places").count().get(),
      db.collection("events").count().get(),
    ]);

    const totalUsers = usersSnap.data().count;
    const totalInteractions = interactionsSnap.data().count;
    const totalPlaces = placesSnap.data().count;
    const totalEvents = eventsSnap.data().count;

    // Recent interactions for action breakdown
    const recentInterSnap = await db
      .collection("interactions")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    const recentInteractions = recentInterSnap.docs.map((d) => d.data());

    const actionCounts = { view: 0, click: 0, save: 0, dismiss: 0 };
    const typeCounts = {};
    const dailyCounts = {};

    for (const inter of recentInteractions) {
      if (inter.actionType && actionCounts[inter.actionType] !== undefined) {
        actionCounts[inter.actionType]++;
      }
      if (inter.placeType) {
        typeCounts[inter.placeType] = (typeCounts[inter.placeType] || 0) + 1;
      }
      if (inter.createdAt) {
        const day = inter.createdAt.slice(0, 10);
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      }
    }

    // Top categories by interaction
    const topCategories = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([category, count]) => ({ category, count }));

    // Daily activity last 14 days
    const now = new Date();
    const dailyActivity = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyActivity.push({ date: key, count: dailyCounts[key] || 0 });
    }

    // Recent users (last 10)
    const recentUsersSnap = await db
      .collection("users")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    const recentUsers = recentUsersSnap.docs.map((d) => {
      const data = d.data();
      return { uid: d.id, email: data.email, createdAt: data.createdAt };
    });

    return res.status(200).json({
      success: true,
      data: {
        totals: { users: totalUsers, interactions: totalInteractions, places: totalPlaces, events: totalEvents },
        actionBreakdown: actionCounts,
        topCategories,
        dailyActivity,
        recentUsers,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── AI Insights ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/ai/insights
 * Returns AI recommendation quality metrics derived from interactions.
 */
router.get("/ai/insights", async (req, res, next) => {
  try {
    const interSnap = await db
      .collection("interactions")
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get();
    const interactions = interSnap.docs.map((d) => d.data());

    const totalRecs = interactions.length;
    const saves = interactions.filter((i) => i.actionType === "save").length;
    const dismisses = interactions.filter((i) => i.actionType === "dismiss").length;
    const clicks = interactions.filter((i) => i.actionType === "click").length;

    const successRate = totalRecs > 0 ? ((saves + clicks) / totalRecs) * 100 : 0;
    const dismissRate = totalRecs > 0 ? (dismisses / totalRecs) * 100 : 0;

    // Category performance
    const catSuccess = {};
    const catTotal = {};
    for (const inter of interactions) {
      const cat = inter.placeType || "unknown";
      catTotal[cat] = (catTotal[cat] || 0) + 1;
      if (inter.actionType === "save" || inter.actionType === "click") {
        catSuccess[cat] = (catSuccess[cat] || 0) + 1;
      }
    }

    const categoryPerformance = Object.entries(catTotal)
      .map(([category, total]) => ({
        category,
        total,
        successes: catSuccess[category] || 0,
        rate: total > 0 ? (((catSuccess[category] || 0) / total) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Experiment breakdown if present
    const withExperiment = interactions.filter((i) => i.experimentVariant);
    const variantA = withExperiment.filter((i) => i.experimentVariant === "A");
    const variantB = withExperiment.filter((i) => i.experimentVariant === "B");
    const expScore = (arr) => {
      const s = arr.filter((i) => i.actionType === "save" || i.actionType === "click").length;
      return arr.length > 0 ? ((s / arr.length) * 100).toFixed(1) : "0";
    };

    // Get model from Firestore
    let modelInfo = null;
    try {
      const modelSnap = await db.collection("models").doc("current").get();
      if (modelSnap.exists) {
        const m = modelSnap.data();
        modelInfo = {
          version: m.version,
          trainedAt: m.trainedAt,
          sampleCount: m.sampleCount,
          finalLoss: m.finalLoss,
          modelActive: m.modelActive,
        };
      }
    } catch {
      // non-fatal
    }

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalInteractions: totalRecs,
          saves,
          clicks,
          dismisses,
          successRate: successRate.toFixed(1),
          dismissRate: dismissRate.toFixed(1),
        },
        categoryPerformance,
        experiments: {
          variantA: { count: variantA.length, score: expScore(variantA) },
          variantB: { count: variantB.length, score: expScore(variantB) },
        },
        model: modelInfo,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Notifications ────────────────────────────────────────────────────────────

/**
 * POST /api/admin/notifications
 * Logs a notification record (FCM sending would be wired here).
 * Body: { title, message, type }
 */
router.post("/notifications", async (req, res, next) => {
  try {
    const { title, message, type = "announcement" } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: "title and message are required" });
    }
    const docRef = db.collection("admin_notifications").doc();
    const doc = {
      id: docRef.id,
      title,
      message,
      type,
      sentBy: req.user.email ?? req.user.uid,
      sentAt: new Date().toISOString(),
    };
    await docRef.set(doc);
    logger.info(`[admin] Notification sent: "${title}" by ${doc.sentBy}`);
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/notifications
 */
router.get("/notifications", async (req, res, next) => {
  try {
    const snap = await db
      .collection("admin_notifications")
      .orderBy("sentAt", "desc")
      .limit(50)
      .get();
    const notifications = snap.docs.map((d) => d.data());
    return res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
});

export default router;
