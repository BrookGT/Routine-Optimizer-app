/**
 * routes/reminder.routes.js — Custom reminders
 *
 * POST   /api/reminders
 * GET    /api/reminders
 * GET    /api/reminders/:id
 * PUT    /api/reminders/:id
 * DELETE /api/reminders/:id
 * PATCH  /api/reminders/:id/toggle
 */

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import {
  listReminders,
  createReminderHandler,
  getReminderHandler,
  updateReminderHandler,
  deleteReminderHandler,
  toggleReminderHandler,
} from "../controllers/reminder.controller.js";

const router = Router();

router.get("/", authenticate, listReminders);
router.post("/", authLimiter, authenticate, createReminderHandler);
router.get("/:id", authenticate, getReminderHandler);
router.put("/:id", authLimiter, authenticate, updateReminderHandler);
router.delete("/:id", authLimiter, authenticate, deleteReminderHandler);
router.patch("/:id/toggle", authLimiter, authenticate, toggleReminderHandler);

export default router;
