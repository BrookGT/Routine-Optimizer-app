import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSystemStatus,
  runSeed,
  runSeedPlaces,
  setExperimentActive,
  setFallbackMode,
  getAiStatus,
  trainAiModel,
  resetAiModel,
} from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { cn } from "@/utils/cn";

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

function ActionButton({ label, description, buttonLabel, onClick, isLoading, result, variant = "secondary" }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-sm text-slate-500">{description}</p>
        {result && <p className="text-xs text-slate-500 mt-1">{result}</p>}
      </div>
      <Button variant={variant} onClick={onClick} disabled={isLoading}>
        {isLoading ? "Running..." : buttonLabel}
      </Button>
    </div>
  );
}

export default function DevToolsPage() {
  const queryClient = useQueryClient();
  const [log, setLog] = useState([]);
  const [seedMsg, setSeedMsg] = useState("");
  const [seedPlacesMsg, setSeedPlacesMsg] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const systemQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: () => getSystemStatus(),
  });
  const aiStatusQuery = useQuery({
    queryKey: ["dev-ai-status"],
    queryFn: getAiStatus,
  });

  const addLog = (message) => {
    setLog((prev) =>
      [{ id: crypto.randomUUID(), message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 10)
    );
  };

  const handleToggle = async (type, value) => {
    setIsBusy(true);
    try {
      if (type === "experiment") {
        await setExperimentActive(value);
        addLog(`Experiments ${value ? "enabled" : "disabled"}`);
      } else {
        await setFallbackMode(value);
        addLog(`Fallback mode ${value ? "enabled" : "disabled"}`);
      }
      await systemQuery.refetch();
    } catch (err) {
      addLog(`Error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSeed = async () => {
    setIsBusy(true);
    setSeedMsg("");
    try {
      const result = await runSeed();
      setSeedMsg(result.message ?? "Seed complete");
      addLog("Seed run executed");
    } catch (err) {
      setSeedMsg(err.message);
      addLog("Seed error: " + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSeedPlaces = async () => {
    setIsBusy(true);
    setSeedPlacesMsg("");
    try {
      const result = await runSeedPlaces();
      setSeedPlacesMsg(result.message ?? "Places seeded");
      addLog("Places seed executed");
    } catch (err) {
      setSeedPlacesMsg(err.message);
      addLog("Places seed error: " + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleTrainAI = async () => {
    setIsBusy(true);
    try {
      const result = await trainAiModel();
      addLog("AI training triggered: " + (result?.message ?? "ok"));
      queryClient.invalidateQueries(["dev-ai-status"]);
    } catch (err) {
      addLog("Train error: " + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetAI = async () => {
    setIsBusy(true);
    try {
      const result = await resetAiModel();
      addLog("AI model reset: " + (result?.message ?? "ok"));
      queryClient.invalidateQueries(["dev-ai-status"]);
    } catch (err) {
      addLog("Reset error: " + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const system = systemQuery.data?.data;
  const aiStatus = aiStatusQuery.data?.data ?? aiStatusQuery.data;

  const isDev = import.meta.env.DEV;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dev Tools & System Controls</h2>
        <p className="text-sm text-slate-500">
          Runtime flags, AI controls, and data operations.
          {!isDev && (
            <span className="ml-2 text-amber-600 font-medium">
              Some features are restricted to development mode.
            </span>
          )}
        </p>
      </div>

      {systemQuery.isError && (
        <Alert variant="error">{systemQuery.error?.message}</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Runtime Flags */}
        <Card>
          <CardHeader>
            <CardTitle>Runtime Flags</CardTitle>
            <Badge variant={systemQuery.data ? "success" : systemQuery.isLoading ? "warning" : "default"}>
              {systemQuery.isLoading ? "Loading" : systemQuery.data ? "Online" : "Unavailable"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {systemQuery.isLoading && <LoadingState label="Loading system state..." />}
            <ToggleRow
              label="A/B Experiments"
              description="Enable or disable A/B experiment assignment for users."
              enabled={system?.experimentActive ?? false}
              onToggle={(v) => handleToggle("experiment", v)}
              disabled={isBusy || !isDev}
            />
            <ToggleRow
              label="Fallback Mode"
              description="Return seed fallback data instead of 500 errors."
              enabled={system?.fallbackEnabled ?? false}
              onToggle={(v) => handleToggle("fallback", v)}
              disabled={isBusy || !isDev}
            />
            <p className="text-xs text-slate-400">Changes apply immediately and reset on restart.</p>
          </CardContent>
        </Card>

        {/* AI Status */}
        <Card>
          <CardHeader>
            <CardTitle>AI Service Status</CardTitle>
            <Badge variant={aiStatus ? "success" : "warning"}>
              {aiStatusQuery.isLoading ? "Checking..." : aiStatus ? "Reachable" : "Unknown"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {aiStatus && (
              <>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className="font-semibold text-slate-900">{aiStatus.status ?? "--"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Model Version</span>
                  <span className="font-semibold text-slate-900">{aiStatus.modelVersion ?? "--"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sample Count</span>
                  <span className="font-semibold text-slate-900">{aiStatus.sampleCount ?? "--"}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* AI Controls */}
        <Card>
          <CardHeader>
            <CardTitle>AI Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActionButton
              label="Retrain AI Model"
              description="Trigger a full model retraining cycle using current interaction data."
              buttonLabel="Retrain Now"
              onClick={handleTrainAI}
              isLoading={isBusy}
            />
            <ActionButton
              label="Reset AI Model"
              description="Clear the trained model and reset weights to defaults."
              buttonLabel="Reset"
              onClick={handleResetAI}
              isLoading={isBusy}
              variant="ghost"
            />
          </CardContent>
        </Card>

        {/* Data Operations */}
        <Card>
          <CardHeader>
            <CardTitle>Data Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActionButton
              label="Seed Interactions"
              description="Seed sample interaction data into Firestore (dev only)."
              buttonLabel="Run Seed"
              onClick={handleSeed}
              isLoading={isBusy}
              result={seedMsg}
            />
            <ActionButton
              label="Seed Places"
              description="Seed the places catalogue if empty (dev only)."
              buttonLabel="Seed Places"
              onClick={handleSeedPlaces}
              isLoading={isBusy}
              result={seedPlacesMsg}
            />
          </CardContent>
        </Card>
      </div>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Action Log</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-slate-400">No actions performed yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b border-slate-50 pb-1 last:border-0"
                >
                  <span className="text-slate-700">{entry.message}</span>
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
