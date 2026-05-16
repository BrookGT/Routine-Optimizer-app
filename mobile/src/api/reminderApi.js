import { apiClient } from "./client";
import { unwrapApiData } from "../utils/api";
import { resyncAllCustomReminderNotifications } from "../services/customReminderService";

export async function getReminders() {
    const res = await apiClient.get("/reminders");
    const list = unwrapApiData(res.data, []);
    return Array.isArray(list) ? list : [];
}

export async function getReminder(id) {
    const res = await apiClient.get(`/reminders/${id}`);
    return unwrapApiData(res.data, null);
}

export async function createReminder(body) {
    const res = await apiClient.post("/reminders", body);
    return unwrapApiData(res.data, null);
}

export async function updateReminder(id, body) {
    const res = await apiClient.put(`/reminders/${id}`, body);
    return unwrapApiData(res.data, null);
}

export async function deleteReminder(id) {
    await apiClient.delete(`/reminders/${id}`);
}

export async function toggleReminder(id) {
    const res = await apiClient.patch(`/reminders/${id}/toggle`);
    return unwrapApiData(res.data, null);
}

export async function syncReminderNotificationsWithServer() {
    const list = await getReminders();
    const results = await resyncAllCustomReminderNotifications(list);
    await Promise.all(
        results.map(({ id, notificationIds }) =>
            updateReminder(id, { notificationIds }),
        ),
    );
    return list;
}
