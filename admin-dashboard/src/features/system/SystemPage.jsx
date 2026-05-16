import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { cn } from "@/utils/cn";
import {
  getSystemStatus,
  getHealth,
  getAiStatus,
  runSeed,
  setExperimentActive,
  setFallbackMode,
} from "@/services/endpoints";

function getFriendlyError(error) {
  const raw = error?.message ?? "";
  const msg = raw.toLowerCase();
  if (msg.includes("development")) return "System controls are only available in development mode.";
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

function ApiStatusRow({ label, value, status }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-slate-500 max-w-[140px] truncate">{value}</span>
        <Badge variant={status}>{status === "success" ? "Configured" : status === "warning" ? "Missing" : "Unknown"}</Badge>
      </div>
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

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 10000,
  });

  const aiQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAiStatus,
  });

  const system = systemQuery.data?.data;
  const health = healthQuery.data?.data;

  const addLog = (message) => {
    setActionLog((prev) =>
      [{ id: crypto.randomUUID(), message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 8)
    );
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

  // Detect config keys from env/health
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
  const hasFirebaseKey = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">System Settings</h2>
        <p className="text-sm text-slate-500">Runtime configuration, API health, and system controls.</p>
      </div>

      {systemQuery.isError && (
        <Alert variant="error">{getFriendlyError(systemQuery.error)}</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle>Backend Status</CardTitle>
            <Badge variant={health?.status === "ok" ? "success" : "warning"}>
              {healthQuery.isLoading ? "Checking..." : health?.status ?? "Unknown"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Environment</span>
              <span className="font-semibold text-slate-900">{health?.environment ?? "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>Firestore</span>
              <Badge variant={health?.firestore === "ok" ? "success" : "warning"}>
                {health?.firestore ?? "--"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>AI Service</span>
              <Badge variant={aiQuery.data ? "success" : "warning"}>
                {aiQuery.isLoading ? "Checking..." : aiQuery.data ? "Reachable" : "Unknown"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <p className="text-xs text-slate-500">Environment variable status</p>
          </CardHeader>
          <CardContent>
            <ApiStatusRow
              label="Backend API URL"
              value={apiBaseUrl}
              status="success"
            />
            <ApiStatusRow
              label="Firebase API Key"
              value={hasFirebaseKey ? "●●●●●●●●●●●●" : "NOT SET"}
              status={hasFirebaseKey ? "success" : "warning"}
            />
            <ApiStatusRow
              label="Google Maps API"
              value={health?.googleMaps ? "Configured" : "Check backend .env"}
              status={health?.googleMaps ? "success" : "warning"}
            />
            <ApiStatusRow
              label="AI Service URL"
              value={aiQuery.data ? "Connected" : "Check AI_SERVICE_URL"}
              status={aiQuery.data ? "success" : "warning"}
            />
            <ApiStatusRow
              label="Scraper"
              value={health?.scraper ?? "See backend SCRAPING_ENABLED"}
              status="default"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Runtime Flags */}
        <Card>
          <CardHeader>
            <CardTitle>Runtime Flags</CardTitle>
            <Badge variant={systemQuery.isLoading ? "warning" : "success"}>{statusLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {systemQuery.isLoading && <LoadingState label="Loading system controls..." />}
            <ToggleRow
              label="A/B Experiments"
              description="Enable or disable A/B experiment user assignment."
              enabled={experimentActive}
              onToggle={(value) => handleToggle("experiment", value)}
              disabled={isUpdating}
            />
            <ToggleRow
              label="Fallback Mode"
              description="Return seed fallback data instead of throwing 500 errors."
              enabled={fallbackEnabled}
              onToggle={(value) => handleToggle("fallback", value)}
              disabled={isUpdating}
            />
            <p className="text-xs text-slate-400">Changes apply immediately and reset on server restart.</p>
          </CardContent>
        </Card>

        {/* Seed Data */}
        <Card>
          <CardHeader>
            <CardTitle>Data Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">Seed the Firestore places collection with sample data.</p>
            <Button variant="secondary" onClick={handleSeed} disabled={isUpdating}>
              {isUpdating ? "Running..." : "Run Seed"}
            </Button>
            {seedMessage && <p className="text-xs text-slate-500">{seedMessage}</p>}
          </CardContent>
        </Card>
      </div>

      {/* AI Thresholds (informational) */}
      <Card>
        <CardHeader>
          <CardTitle>AI & Recommendation Config</CardTitle>
          <p className="text-xs text-slate-500">Current recommendation engine parameters (set via backend environment)</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {[
              { label: "Max Recommendations", value: "10 / request" },
              { label: "Cache TTL", value: "5 min" },
              { label: "Affinity Cap", value: "±50" },
              { label: "Embedding Dims", value: "Per place type" },
              { label: "Retrain Trigger", value: "50 new interactions" },
              { label: "Session Memory", value: "Last 20 actions" },
              { label: "Scrape Schedule", value: "Every 8 hours" },
              { label: "A/B Experiment", value: experimentActive ? "Active" : "Inactive" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="font-semibold text-slate-900 mt-1">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Log */}
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
                <div key={entry.id} className="flex items-center justify-between border-b border-slate-50 pb-1 last:border-0">
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
