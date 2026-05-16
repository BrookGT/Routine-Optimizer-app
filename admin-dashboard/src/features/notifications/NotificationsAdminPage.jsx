import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell, Send } from "lucide-react";
import { postAdminAnnouncement } from "@/services/endpoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const SEVERITIES = [
  { value: "info",    label: "Informational" },
  { value: "warning", label: "Heads-up" },
  { value: "maint",   label: "Maintenance" },
  { value: "promo",   label: "Promotional" },
];

export default function NotificationsAdminPage() {
  const [title,    setTitle]    = useState("");
  const [body,     setBody]     = useState("");
  const [severity, setSeverity] = useState("info");

  const mut = useMutation({
    mutationFn: () => postAdminAnnouncement({ title: title.trim(), body: body.trim(), severity }),
  });

  const handleSubmit = () =>
    mut.mutate(undefined, {
      onSuccess: () => { setTitle(""); setBody(""); },
    });

  const isDisabled = mut.isPending || !title.trim() || !body.trim();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="page-sub">Compose and broadcast system announcements to platform users</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Compose card */}
        <Card>
          <CardHeader>
            <CardTitle>New Announcement</CardTitle>
            <span className="text-xs text-text-tertiary">Recorded to Firestore · consumed by mobile clients</span>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Severity */}
            <div className="space-y-1.5">
              <label className="label-xs">Type</label>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSeverity(value)}
                    className={
                      severity === value
                        ? "rounded-full bg-text-primary text-white px-3 py-1 text-xs font-medium border border-text-primary"
                        : "rounded-full bg-white text-text-secondary border border-border px-3 py-1 text-xs font-medium hover:border-border-strong hover:text-text-primary transition-colors"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="label-xs">Title</label>
              <input
                className="input-base"
                placeholder="e.g. Scheduled maintenance this weekend"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <label className="label-xs">Message body</label>
              <textarea
                className="input-base"
                rows={5}
                style={{ height: "auto", resize: "vertical" }}
                placeholder="Write your announcement here…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            {/* Errors */}
            {mut.isError && <Alert variant="error">{mut.error?.message}</Alert>}

            {/* Success */}
            {mut.isSuccess && mut.data?.id && (
              <Alert variant="success">
                Announcement #{mut.data.id} recorded. Mobile clients subscribed to{" "}
                <code className="text-[10px] bg-surface-overlay px-1 py-0.5 rounded font-mono">system_announcements</code>{" "}
                will receive it.
              </Alert>
            )}

            {/* Submit */}
            <div className="flex justify-end pt-1">
              <Button disabled={isDisabled} onClick={handleSubmit}>
                <Send className="h-3.5 w-3.5" />
                {mut.isPending ? "Sending…" : "Send announcement"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Usage note */}
        <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3">
          <Bell className="h-4 w-4 text-text-tertiary mt-0.5 shrink-0" />
          <p className="text-xs text-text-secondary">
            Announcements are persisted to Firestore and not yet wired to push delivery.
            Wire your mobile app to listen to the <code className="text-[10px] font-mono bg-surface-inset px-1 py-0.5 rounded">system_announcements</code> collection to display them in-app.
          </p>
        </div>
      </div>
    </div>
  );
}
