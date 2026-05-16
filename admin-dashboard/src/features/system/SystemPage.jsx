import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Settings } from "lucide-react";
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

function Toggle({ enabled, onToggle, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
        enabled ? "bg-positive" : "bg-border-strong",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-200",
          enabled ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function ToggleRow({ label, description, enabled, onToggle, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border-subtle last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
      </div>
      <Toggle enabled={enabled} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}

function StatusRow({ label, value, status }) {
  const variants = { success: "success", warning: "warning", default: "default" };
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        {value && <span className="text-[10px] font-mono text-text-tertiary max-w-[160px] truncate">{value}</span>}
        <Badge variant={variants[status] ?? "default"}>
          {status === "success" ? "OK" : status === "warning" ? "Missing" : "—"}
        </Badge>
      </div>
    </div>
  );
}

export default function SystemPage() {
  const [actionLog,   setActionLog]   = useState([]);
  const [isUpdating,  setIsUpdating]  = useState(false);
  const [seedMessage, setSeedMessage] = useState("");

  const systemQuery = useQuery({ queryKey: ["system-status"],  queryFn: getSystemStatus });
  const healthQuery = useQuery({ queryKey: ["health"],         queryFn: getHealth, refetchInterval: 10000 });
  const aiQuery     = useQuery({ queryKey: ["ai-status"],      queryFn: getAiStatus });

  const system = systemQuery.data?.data;
  const health = healthQuery.data?.data;

  const addLog = (msg) =>
    setActionLog((prev) =>
      [{ id: crypto.randomUUID(), msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 8)
    );

  const handleToggle = async (type, nextValue) => {
    setIsUpdating(true);
    try {
      if (type === "experiment") { await setExperimentActive(nextValue); addLog(`Experiments ${nextValue ? "enabled" : "disabled"}`); }
      else                       { await setFallbackMode(nextValue);     addLog(`Fallback mode ${nextValue ? "enabled" : "disabled"}`); }
      await systemQuery.refetch();
    } catch (error) { addLog(getFriendlyError(error)); }
    finally { setIsUpdating(false); }
  };

  const handleSeed = async () => {
    setIsUpdating(true);
    setSeedMessage("");
    try {
      const result = await runSeed();
      setSeedMessage(result.message ?? "Seed complete");
      addLog("Seed run executed");
    } catch (error) { setSeedMessage(getFriendlyError(error)); addLog(getFriendlyError(error)); }
    finally { setIsUpdating(false); }
  };

  const experimentActive = system?.experimentActive ?? false;
  const fallbackEnabled  = system?.fallbackEnabled  ?? false;
  const apiBaseUrl       = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
  const hasFirebaseKey   = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">System Settings</h2>
          <p className="page-sub">Runtime configuration, API health, and platform controls</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { healthQuery.refetch(); systemQuery.refetch(); aiQuery.refetch(); }} disabled={healthQuery.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${healthQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {systemQuery.isError && <Alert variant="error">{getFriendlyError(systemQuery.error)}</Alert>}

      {/* Top row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Backend status */}
        <Card>
          <CardHeader>
            <CardTitle>Backend Status</CardTitle>
            <Badge variant={health?.status === "ok" ? "success" : "warning"} dot>
              {healthQuery.isLoading ? "Checking…" : health?.status ?? "Unknown"}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {[
                { label: "Environment", value: health?.environment ?? "—", status: "default" },
                { label: "Firestore",   value: null, status: health?.firestore === "ok" ? "success" : "warning" },
                { label: "AI Service",  value: null, status: aiQuery.data ? "success" : "warning" },
              ].map(({ label, value, status }) => (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0">
                  <span className="text-xs text-text-secondary">{label}</span>
                  <div className="flex items-center gap-2">
                    {value && <span className="text-xs font-medium text-text-primary">{value}</span>}
                    <Badge variant={status} dot={status !== "default"}>
                      {status === "success" ? "OK" : status === "warning" ? "Issue" : health?.environment ?? "—"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* API config */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <span className="text-xs text-text-tertiary">Environment variable status</span>
          </CardHeader>
          <CardContent>
            <StatusRow label="Backend API URL"   value={apiBaseUrl} status="success" />
            <StatusRow label="Firebase API Key"  value={hasFirebaseKey ? "●●●●●●●●" : "NOT SET"} status={hasFirebaseKey ? "success" : "warning"} />
            <StatusRow label="Google Maps API"   value={null} status={health?.googleMaps ? "success" : "warning"} />
            <StatusRow label="AI Service"        value={null} status={aiQuery.data ? "success" : "warning"} />
            <StatusRow label="Scraper"           value={health?.scraper ?? "Check SCRAPING_ENABLED"} status="default" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Runtime flags */}
        <Card>
          <CardHeader>
            <CardTitle>Runtime Flags</CardTitle>
          </CardHeader>
          <CardContent>
            {systemQuery.isLoading && <LoadingState label="Loading system controls…" />}
            <ToggleRow label="A/B Experiments" description="Enable A/B experiment user assignment" enabled={experimentActive} onToggle={(v) => handleToggle("experiment", v)} disabled={isUpdating} />
            <ToggleRow label="Fallback Mode"   description="Return seed data instead of 500 errors" enabled={fallbackEnabled} onToggle={(v) => handleToggle("fallback", v)} disabled={isUpdating} />
            <p className="text-xs text-text-tertiary mt-3">Changes apply immediately and reset on server restart.</p>
          </CardContent>
        </Card>

        {/* Data operations */}
        <Card>
          <CardHeader>
            <CardTitle>Data Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-text-secondary">Seed the Firestore places collection with sample data for development.</p>
            <Button variant="secondary" size="sm" onClick={handleSeed} disabled={isUpdating}>
              {isUpdating ? "Running…" : "Run seed"}
            </Button>
            {seedMessage && (
              <p className="text-xs text-text-tertiary bg-surface-overlay rounded-md px-3 py-2">{seedMessage}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI & Recommendation config */}
      <Card>
        <CardHeader>
          <CardTitle>AI & Recommendation Config</CardTitle>
          <span className="text-xs text-text-tertiary">Current engine parameters (set via backend environment)</span>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Max recommendations", value: "10 / request" },
              { label: "Cache TTL",           value: "5 min" },
              { label: "Affinity cap",        value: "±50" },
              { label: "Embedding dims",      value: "Per place type" },
              { label: "Retrain trigger",     value: "50 new interactions" },
              { label: "Session memory",      value: "Last 20 actions" },
              { label: "Scrape schedule",     value: "Every 8 hours" },
              { label: "A/B experiment",      value: experimentActive ? "Active" : "Inactive" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-surface-overlay border border-border-subtle px-3 py-3">
                <dt className="label-xs mb-1">{label}</dt>
                <dd className="text-sm font-medium text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Activity log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {actionLog.length === 0 ? (
            <p className="text-sm text-text-tertiary">No actions performed this session.</p>
          ) : (
            <div className="font-mono">
              {actionLog.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                  <span className="text-xs text-text-secondary">{entry.msg}</span>
                  <span className="text-[10px] text-text-tertiary ml-4 shrink-0">{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
