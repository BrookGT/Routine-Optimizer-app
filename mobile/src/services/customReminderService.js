/**
 * customReminderService.js — User-created reminders (Expo local notifications)
 *
 * Isolated from morning/afternoon/evening/dynamic scheduling.
 * Uses dedicated Android channel + data.type === "custom_reminder".
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const CUSTOM_REMINDER_CHANNEL = "wuloye-custom-reminder";

const Sched = Notifications.SchedulableTriggerInputTypes;

export const REMINDER_CATEGORY_DEEP_LINK = {
    events: "wuloye://events",
    gym_workout: "wuloye://discover",
    prayer: "wuloye://discover",
    meeting: "wuloye://discover",
    study: "wuloye://recommendations",
    medication: "wuloye://home",
    work: "wuloye://discover",
    routine_activity: "wuloye://schedule",
    travel: "wuloye://discover",
    shopping: "wuloye://discover",
    appointment: "wuloye://home",
    entertainment: "wuloye://trending",
    custom: "wuloye://home",
};

export function deepLinkForReminderCategory(category) {
    return (
        REMINDER_CATEGORY_DEEP_LINK[category] ??
        REMINDER_CATEGORY_DEEP_LINK.custom
    );
}

function jsWeekdayToExpo(jsDay) {
    return jsDay + 1;
}

const WEEKDAY_EXPO_MON_FRI = [2, 3, 4, 5, 6];
const WEEKEND_EXPO = [1, 7];

function parseHourMinute(timeStr) {
    const [h, m] = String(timeStr || "09:00").split(":");
    const hour = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
    const minute = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
    return { hour, minute };
}

function combineLocalDateTime(dateStr, timeStr) {
    const [y, mo, d] = String(dateStr).split("-").map(Number);
    const { hour, minute } = parseHourMinute(timeStr);
    return new Date(y, mo - 1, d, hour, minute, 0, 0);
}

function reminderBody(reminder) {
    const cat =
        reminder.category === "custom" && reminder.customCategoryLabel
            ? reminder.customCategoryLabel
            : formatCategoryLabel(reminder.category);
    const desc = reminder.description?.trim();
    return {
        title: String(reminder.title || "Reminder"),
        body: desc || `${cat}`,
    };
}

export function formatCategoryLabel(category) {
    const labels = {
        events: "Events",
        gym_workout: "Gym / Workout",
        prayer: "Prayer",
        meeting: "Meeting",
        study: "Study",
        medication: "Medication",
        work: "Work",
        routine_activity: "Routine",
        travel: "Travel",
        shopping: "Shopping",
        appointment: "Appointment",
        entertainment: "Entertainment",
        custom: "Custom",
    };
    return labels[category] ?? category;
}

function reminderDataPayload(reminder, slot = 0) {
    const category = reminder.category || "custom";
    return {
        type: "custom_reminder",
        reminderId: reminder.id,
        category,
        deepLink: deepLinkForReminderCategory(category),
        triggerSlot: slot,
    };
}

function baseContent(reminder, slot) {
    const { title, body } = reminderBody(reminder);
    return {
        title,
        body,
        sound: true,
        data: reminderDataPayload(reminder, slot),
        ...(Platform.OS === "android" && { channelId: CUSTOM_REMINDER_CHANNEL }),
    };
}

export async function ensureCustomReminderAndroidChannel() {
    if (Platform.OS !== "android") return;

    await Notifications.setNotificationChannelAsync(CUSTOM_REMINDER_CHANNEL, {
        name: "My reminders",
        description: "Your custom scheduled reminders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 220, 120, 220],
        lightColor: "#26C97A",
        sound: "default",
        enableVibrate: true,
        showBadge: false,
    });
}

export async function cancelAllCustomReminderNotificationsScheduled() {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
        all
            .filter((n) => n.content?.data?.type === "custom_reminder")
            .map((n) =>
                Notifications.cancelScheduledNotificationAsync(n.identifier),
            ),
    );
}

export async function scheduleReminderNotifications(reminder) {
    if (!reminder?.enabled || !reminder?.id) return [];

    await ensureCustomReminderAndroidChannel();

    const { hour, minute } = parseHourMinute(reminder.time);
    const repeat = reminder.repeat || { type: "once", customDays: null };
    const ids = [];

    switch (repeat.type) {
        case "once": {
            const fireAt = combineLocalDateTime(reminder.date, reminder.time);
            if (fireAt.getTime() <= Date.now()) {
                return [];
            }
            const id = await Notifications.scheduleNotificationAsync({
                content: baseContent(reminder, 0),
                trigger: { type: Sched.DATE, date: fireAt },
            });
            ids.push(id);
            break;
        }
        case "daily": {
            const id = await Notifications.scheduleNotificationAsync({
                content: baseContent(reminder, 0),
                trigger: { type: Sched.DAILY, hour, minute },
            });
            ids.push(id);
            break;
        }
        case "weekdays": {
            let i = 0;
            for (const weekday of WEEKDAY_EXPO_MON_FRI) {
                const id = await Notifications.scheduleNotificationAsync({
                    content: baseContent(reminder, i),
                    trigger: { type: Sched.WEEKLY, weekday, hour, minute },
                });
                ids.push(id);
                i += 1;
            }
            break;
        }
        case "weekends": {
            let i = 0;
            for (const weekday of WEEKEND_EXPO) {
                const id = await Notifications.scheduleNotificationAsync({
                    content: baseContent(reminder, i),
                    trigger: { type: Sched.WEEKLY, weekday, hour, minute },
                });
                ids.push(id);
                i += 1;
            }
            break;
        }
        case "custom": {
            const days = [...new Set(repeat.customDays || [])].sort();
            let i = 0;
            for (const jsDay of days) {
                const weekday = jsWeekdayToExpo(jsDay);
                const id = await Notifications.scheduleNotificationAsync({
                    content: baseContent(reminder, i),
                    trigger: { type: Sched.WEEKLY, weekday, hour, minute },
                });
                ids.push(id);
                i += 1;
            }
            break;
        }
        default:
            break;
    }

    return ids;
}

/**
 * Full resync: clears all custom reminder triggers, then schedules every enabled reminder.
 * Returns { id: reminderId, notificationIds: string[] }[] for persisting to backend.
 */
export async function resyncAllCustomReminderNotifications(reminders) {
    await cancelAllCustomReminderNotificationsScheduled();
    const list = Array.isArray(reminders) ? reminders : [];
    const enabled = list.filter((r) => r && r.enabled);

    const results = [];
    for (const r of enabled) {
        const notificationIds = await scheduleReminderNotifications(r);
        results.push({ id: r.id, notificationIds });
    }
    return results;
}
