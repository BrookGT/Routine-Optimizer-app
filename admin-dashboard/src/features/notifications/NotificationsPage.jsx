import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminNotifications,
  sendAdminNotification,
} from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";

const NOTIFICATION_TYPES = [
  { value: "announcement", label: "📢 Announcement" },
  { value: "event_alert", label: "📅 Event Alert" },
  { value: "maintenance", label: "🔧 Maintenance" },
  { value: "push", label: "🔔 Push Notification" },
];

function formatDate(v) {
  if (!v) return "--";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: "", message: "", type: "announcement" });
  const [sent, setSent] = useState(false);

  const notifQuery = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: getAdminNotifications,
  });

  const sendMutation = useMutation({
    mutationFn: sendAdminNotification,
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-notifications"]);
      setForm({ title: "", message: "", type: "announcement" });
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    },
  });

  const notifications = notifQuery.data?.data ?? [];

  const TYPE_COLORS = {
    announcement: "bg-sky-100 text-sky-700",
    event_alert: "bg-violet-100 text-violet-700",
    maintenance: "bg-amber-100 text-amber-700",
    push: "bg-emerald-100 text-emerald-700",
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Notification Management</h2>
        <p className="text-sm text-slate-500">
          Send announcements, alerts, and push notifications to users.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compose */}
        <Card>
          <CardHeader>
            <CardTitle>Compose Notification</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMutation.mutate(form);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Type
                </label>
                <select
                  className="input-field"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {NOTIFICATION_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Title *
                </label>
                <input
                  required
                  className="input-field"
                  placeholder="Notification title..."
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Message *
                </label>
                <textarea
                  required
                  rows={4}
                  className="input-field resize-none"
                  placeholder="Enter your message..."
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              </div>
              {sent && (
                <Alert variant="success" className="py-2">
                  Notification sent successfully!
                </Alert>
              )}
              {sendMutation.isError && (
                <Alert variant="error">{sendMutation.error?.message}</Alert>
              )}
              <Button
                type="submit"
                disabled={sendMutation.isPending}
                className="w-full"
              >
                {sendMutation.isPending ? "Sending..." : "Send Notification"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sent Notifications</CardTitle>
              <Button variant="ghost" className="h-7 text-xs" onClick={() => queryClient.invalidateQueries(["admin-notifications"])}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {notifQuery.isLoading && <LoadingState label="Loading..." />}
            {notifQuery.isError && <Alert variant="error">{notifQuery.error?.message}</Alert>}
            {notifications.length === 0 && !notifQuery.isLoading && (
              <p className="text-sm text-slate-400">No notifications sent yet.</p>
            )}
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm text-slate-900">{n.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                        TYPE_COLORS[n.type] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {n.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">{n.message}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>By: {n.sentBy}</span>
                    <span>{formatDate(n.sentAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Templates</CardTitle>
          <p className="text-xs text-slate-500">Click to pre-fill the compose form</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {[
            {
              title: "New Events Available",
              message: "Check out the latest events in your area this weekend! Open the app to explore.",
              type: "event_alert",
            },
            {
              title: "System Maintenance",
              message: "We will be performing scheduled maintenance. The app may be briefly unavailable.",
              type: "maintenance",
            },
            {
              title: "New Recommendations Ready",
              message: "We have refreshed your personalized recommendations. See what's new!",
              type: "push",
            },
            {
              title: "App Update Available",
              message: "A new version of Wuloye is available with performance improvements and new features.",
              type: "announcement",
            },
          ].map((template) => (
            <button
              key={template.title}
              type="button"
              onClick={() => setForm(template)}
              className="rounded-xl border border-slate-200 p-3 text-left hover:border-sky-300 hover:bg-sky-50 transition-colors"
            >
              <p className="font-semibold text-sm text-slate-800">{template.title}</p>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.message}</p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  TYPE_COLORS[template.type] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {template.type}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
