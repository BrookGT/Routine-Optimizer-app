import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { cn } from "@/utils/cn";
import { getSystemStatus, runSeed, setExperimentActive, setFallbackMode } from "@/services/endpoints";

function getFriendlyError(error) {
  const raw = error?.message ?? "";
  const message = raw.toLowerCase();
  if (message.includes("development")) {
    return "System controls are only available in development mode.";
  }
  return raw || "Unable to update system settings.";
}

function ToggleRow({ label, description, enabled, onToggle, disabled }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          enabled ? "bg-emerald-500" : "bg-slate-300",
          disabled && "opacity-50"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white transition",
            enabled ? "translate-x-5" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

export default function SystemPage() {
  const [actionLog, setActionLog] = useState([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");

  const systemQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: () => getSystemStatus(),
  });

  const system = systemQuery.data?.data;

  const addLog = (message) => {
    setActionLog((prev) => [
      { id: crypto.randomUUID(), message, time: new Date().toLocaleTimeString() },
      ...prev,
    ].slice(0, 5));
  };

  const handleToggle = async (type, nextValue) => {
    setIsUpdating(true);
    try {
      if (type === "experiment") {
        await setExperimentActive(nextValue);
        addLog(`Experiments ${nextValue ? "enabled" : "disabled"}`);
      } else {
        await setFallbackMode(nextValue);
        addLog(`Fallback mode ${nextValue ? "enabled" : "disabled"}`);
      }
      await systemQuery.refetch();
    } catch (error) {
      addLog(getFriendlyError(error));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSeed = async () => {
    setIsUpdating(true);
    setSeedMessage("");
    try {
      const result = await runSeed();
      setSeedMessage(result.message ?? "Seed complete");
      addLog("Seed run executed");
    } catch (error) {
      setSeedMessage(getFriendlyError(error));
      addLog(getFriendlyError(error));
    } finally {
      setIsUpdating(false);
    }
  };

  const experimentActive = system?.experimentActive ?? false;
  const fallbackEnabled = system?.fallbackEnabled ?? false;

  const statusLabel = useMemo(() => {
    if (!systemQuery.data) return "Unknown";
    return "Online";
  }, [systemQuery.data]);

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-slate-900">System Control</h3>
        <p className="text-sm text-slate-500">Toggle runtime flags and trigger data operations.</p>
      </div>

      {systemQuery.isError && (
        <Alert variant="error">{getFriendlyError(systemQuery.error)}</Alert>
      )}

      {systemQuery.isLoading && <LoadingState label="Loading system controls..." />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Runtime Flags</CardTitle>
            <Badge variant={systemQuery.isLoading ? "warning" : "success"}>{statusLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              label="Experiments"
              description="Enable or disable A/B experiment assignment."
              enabled={experimentActive}
              onToggle={(value) => handleToggle("experiment", value)}
              disabled={isUpdating}
            />
            <ToggleRow
              label="Fallback Mode"
              description="Return seed fallback instead of 500 errors."
              enabled={fallbackEnabled}
              onToggle={(value) => handleToggle("fallback", value)}
              disabled={isUpdating}
            />
            <p className="text-xs text-slate-400">Changes apply immediately and reset on restart.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seed Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">Seed the Firestore places collection.</p>
            <Button variant="secondary" onClick={handleSeed} disabled={isUpdating}>
              Run Seed
            </Button>
            {seedMessage && <p className="text-xs text-slate-500">{seedMessage}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {actionLog.length === 0 ? (
            <p className="text-sm text-slate-500">No actions yet.</p>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              {actionLog.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between">
                  <span>{entry.message}</span>
                  <span className="text-xs text-slate-400">{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
