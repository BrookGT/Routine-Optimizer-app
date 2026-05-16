/**
 * controllers/reminder.controller.js — Custom reminders API
 */

import {
  createReminder,
  getRemindersByUser,
  getReminderById,
  updateReminder,
  deleteReminder,
  REMINDER_CATEGORIES,
  REPEAT_TYPES,
} from "../services/reminder.service.js";

const TITLE_MAX = 200;
const DESC_MAX = 2000;

function validateReminderBody(body, { partial = false } = {}) {
  if (!partial && (!body.title || typeof body.title !== "string" || !body.title.trim())) {
    return "title is required";
  }
  if (body.title != null && body.title.length > TITLE_MAX) {
    return `title must be at most ${TITLE_MAX} characters`;
  }
  if (body.description != null && String(body.description).length > DESC_MAX) {
    return `description must be at most ${DESC_MAX} characters`;
  }
  if (!partial) {
    if (!body.category || typeof body.category !== "string") {
      return "category is required";
    }
    if (!REMINDER_CATEGORIES.includes(body.category)) {
      return `category must be one of: ${REMINDER_CATEGORIES.join(", ")}`;
    }
    if (body.category === "custom") {
      const label = body.customCategoryLabel;
      if (!label || typeof label !== "string" || label.trim().length < 1) {
        return "customCategoryLabel is required when category is custom";
      }
      if (label.length > 80) return "customCategoryLabel too long";
    }
    if (!body.date || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return "date must be YYYY-MM-DD";
    }
    if (!body.time || typeof body.time !== "string" || !/^\d{1,2}:\d{2}$/.test(body.time)) {
      return "time must be HH:mm";
    }
    const repeat = body.repeat;
    if (!repeat || typeof repeat !== "object") {
      return "repeat object is required";
    }
    if (!REPEAT_TYPES.includes(repeat.type)) {
      return `repeat.type must be one of: ${REPEAT_TYPES.join(", ")}`;
    }
    if (repeat.type === "custom") {
      if (!Array.isArray(repeat.customDays) || repeat.customDays.length === 0) {
        return "repeat.customDays must be a non-empty array for custom repeat";
      }
      for (const d of repeat.customDays) {
        if (!Number.isInteger(d) || d < 0 || d > 6) {
          return "repeat.customDays must be integers 0–6 (Sun–Sat)";
        }
      }
    }
  } else {
    if (body.category != null && !REMINDER_CATEGORIES.includes(body.category)) {
      return `category must be one of: ${REMINDER_CATEGORIES.join(", ")}`;
    }
    if (body.category === "custom" && body.customCategoryLabel != null) {
      const label = body.customCategoryLabel;
      if (typeof label !== "string" || label.trim().length < 1) {
        return "customCategoryLabel invalid";
      }
    }
    if (body.repeat != null) {
      if (!REPEAT_TYPES.includes(body.repeat.type)) {
        return `repeat.type must be one of: ${REPEAT_TYPES.join(", ")}`;
      }
      if (
        body.repeat.type === "custom" &&
        (!Array.isArray(body.repeat.customDays) || body.repeat.customDays.length === 0)
      ) {
        return "repeat.customDays required for custom repeat";
      }
    }
  }
  if (body.notificationIds != null && !Array.isArray(body.notificationIds)) {
    return "notificationIds must be an array of strings";
  }
  return null;
}

function pickCreateFields(body) {
  return {
    title: String(body.title).trim(),
    description: body.description != null ? String(body.description).trim() : "",
    category: body.category,
    customCategoryLabel:
      body.category === "custom" && body.customCategoryLabel
        ? String(body.customCategoryLabel).trim()
        : null,
    date: body.date,
    time: normalizeTime(body.time),
    repeat: {
      type: body.repeat.type,
      customDays:
        body.repeat.type === "custom" ? [...new Set(body.repeat.customDays)].sort() : null,
    },
    enabled: body.enabled !== false,
    notificationIds: Array.isArray(body.notificationIds) ? body.notificationIds.map(String) : [],
  };
}

function normalizeTime(t) {
  const [h, m] = String(t).split(":");
  const hh = String(Math.min(23, Math.max(0, parseInt(h, 10) || 0))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, parseInt(m, 10) || 0))).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function listReminders(req, res, next) {
  try {
    const data = await getRemindersByUser(req.user.uid);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createReminderHandler(req, res, next) {
  try {
    const err = validateReminderBody(req.body);
    if (err) {
      return res.status(400).json({ success: false, data: null, message: err });
    }
    const reminder = await createReminder(req.user.uid, pickCreateFields(req.body));
    res.status(201).json({ success: true, data: reminder });
  } catch (e) {
    next(e);
  }
}

export async function getReminderHandler(req, res, next) {
  try {
    const r = await getReminderById(req.params.id);
    if (!r || r.userId !== req.user.uid) {
      return res.status(404).json({ success: false, data: null, message: "Reminder not found" });
    }
    res.json({ success: true, data: r });
  } catch (e) {
    next(e);
  }
}

export async function updateReminderHandler(req, res, next) {
  try {
    const err = validateReminderBody(req.body, { partial: true });
    if (err) {
      return res.status(400).json({ success: false, data: null, message: err });
    }
    const existing = await getReminderById(req.params.id);
    if (!existing || existing.userId !== req.user.uid) {
      return res.status(404).json({ success: false, data: null, message: "Reminder not found" });
    }

    const updates = {};
    const b = req.body;
    if (b.title !== undefined) updates.title = String(b.title).trim();
    if (b.description !== undefined) updates.description = String(b.description).trim();
    if (b.category !== undefined) {
      updates.category = b.category;
      if (b.category !== "custom") updates.customCategoryLabel = null;
    }
    if (b.customCategoryLabel !== undefined) {
      updates.customCategoryLabel =
        existing.category === "custom" || b.category === "custom"
          ? String(b.customCategoryLabel).trim()
          : null;
    }
    if (b.date !== undefined) updates.date = b.date;
    if (b.time !== undefined) updates.time = normalizeTime(b.time);
    if (b.repeat !== undefined) {
      updates.repeat = {
        type: b.repeat.type,
        customDays:
          b.repeat.type === "custom"
            ? [...new Set(b.repeat.customDays)].sort()
            : null,
      };
    }
    if (b.enabled !== undefined) updates.enabled = Boolean(b.enabled);
    if (b.notificationIds !== undefined) {
      updates.notificationIds = b.notificationIds.map(String);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "No valid fields to update",
      });
    }

    const updated = await updateReminder(req.params.id, updates);
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
}

export async function deleteReminderHandler(req, res, next) {
  try {
    const existing = await getReminderById(req.params.id);
    if (!existing || existing.userId !== req.user.uid) {
      return res.status(404).json({ success: false, data: null, message: "Reminder not found" });
    }
    await deleteReminder(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
}

export async function toggleReminderHandler(req, res, next) {
  try {
    const existing = await getReminderById(req.params.id);
    if (!existing || existing.userId !== req.user.uid) {
      return res.status(404).json({ success: false, data: null, message: "Reminder not found" });
    }
    const updated = await updateReminder(req.params.id, { enabled: !existing.enabled });
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
}
