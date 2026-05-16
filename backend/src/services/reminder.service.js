/**
 * services/reminder.service.js — User-created custom reminders (Firestore)
 *
 * Collection: reminders
 *
 * Listing uses only where(userId) — sort happens in Node so no composite
 * Firestore index is required (avoids FAILED_PRECONDITION on fresh projects).
 */

import { db } from "../config/firebase.js";

const REMINDERS_COLLECTION = "reminders";

export const REMINDER_CATEGORIES = [
  "events",
  "gym_workout",
  "prayer",
  "meeting",
  "study",
  "medication",
  "work",
  "routine_activity",
  "travel",
  "shopping",
  "appointment",
  "entertainment",
  "custom",
];

export const REPEAT_TYPES = ["once", "daily", "weekdays", "weekends", "custom"];

/**
 * @param {string} userId
 * @param {object} data
 */
export const createReminder = async (userId, data) => {
  const docRef = db.collection(REMINDERS_COLLECTION).doc();
  const now = new Date().toISOString();

  const reminder = {
    id: docRef.id,
    userId,
    title: data.title,
    description: data.description ?? "",
    category: data.category,
    customCategoryLabel: data.customCategoryLabel ?? null,
    date: data.date,
    time: data.time,
    repeat: data.repeat ?? { type: "once", customDays: null },
    enabled: data.enabled !== false,
    notificationIds: Array.isArray(data.notificationIds) ? data.notificationIds : [],
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(reminder);
  return reminder;
};

export const getRemindersByUser = async (userId) => {
  const snapshot = await db
    .collection(REMINDERS_COLLECTION)
    .where("userId", "==", userId)
    .get();

  const list = snapshot.docs.map((d) => d.data());
  list.sort((a, b) => {
    const ta = String(a.createdAt ?? a.updatedAt ?? "");
    const tb = String(b.createdAt ?? b.updatedAt ?? "");
    const cmp = tb.localeCompare(ta);
    if (cmp !== 0) return cmp;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
  return list;
};

export const getReminderById = async (id) => {
  const snap = await db.collection(REMINDERS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data();
};

export const updateReminder = async (id, updates) => {
  const docRef = db.collection(REMINDERS_COLLECTION).doc(id);
  const payload = { ...updates, updatedAt: new Date().toISOString() };
  await docRef.update(payload);
  const snap = await docRef.get();
  return snap.data();
};

export const deleteReminder = async (id) => {
  await db.collection(REMINDERS_COLLECTION).doc(id).delete();
};
