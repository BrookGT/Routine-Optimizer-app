import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Brain, RefreshCw, RotateCcw, Zap } from "lucide-react";
import {
  getAdminAiInsights,
  getAiStatus,
  resetAiModel,
  trainAiModel,
} from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState, SkeletonCard, SkeletonRow } from "@/components/ui/loading";
import { Progress } from "@/components/ui/progress";

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-text-primary capitalize mb-1">{label}</p>
      <p className="text-text-secondary tabular-nums">{payload[0]?.value}%</p>
    </div>
  );
};

export default function AiModelPage() {
  const queryClient = useQueryClient();
  const [actionLog, setActionLog] = useState([]);

  const insightsQuery = useQuery({
    queryKey: ["ai-insights"],
    queryFn: getAdminAiInsights,
    refetchInterval: 30000,
  });
  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAiStatus,
    refetchInterval: 30000,
  });

  const addLog = (msg) =>
    setActionLog((prev) =>
      [{ id: crypto.randomUUID(), msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 10)
    );

  const trainMutation = useMutation({
    mutationFn: trainAiModel,
    onSuccess: (data) => { addLog("Training triggered: " + (data?.message ?? "ok")); queryClient.invalidateQueries(["ai-insights", "ai-status"]); },
    onError:   (err)  => addLog("Train error: " + err.message),
  });
  const resetMutation = useMutation({
    mutationFn: resetAiModel,
    onSuccess: (data) => { addLog("Model reset: " + (data?.message ?? "ok")); queryClient.invalidateQueries(["ai-insights", "ai-status"]); },
    onError:   (err)  => addLog("Reset error: " + err.message),
  });

  const insights     = insightsQuery.data?.data;
  const summary      = insights?.summary ?? {};
  const categoryPerf = insights?.categoryPerformance ?? [];
  const experiments  = insights?.experiments ?? {};
  const model        = insights?.model ?? statusQuery.data?.data ?? {};
  const isBusy       = trainMutation.isPending || resetMutation.isPending;
  const isLoading    = insightsQuery.isLoading;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">AI Monitor</h2>
          <p className="page-sub">Recommendation quality, model health, and AI lifecycle controls</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary" size="sm"
            onClick={() => { insightsQuery.refetch(); statusQuery.refetch(); }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => trainMutation.mutate()} disabled={isBusy}>
            <Zap className="h-3.5 w-3.5" />
            {trainMutation.isPending ? "Training…" : "Retrain"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} disabled={isBusy} className="text-negative border-[#fecaca] hover:bg-[#fef2f2]">
            <RotateCcw className="h-3.5 w-3.5" />
            {resetMutation.isPending ? "Resetting…" : "Reset"}
          </Button>
        </div>
      </div>

      {(insightsQuery.isError || statusQuery.isError) && (
        <Alert variant="error">{insightsQuery.error?.message || statusQuery.error?.message}</Alert>
      )}

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Model status */}
          <Card>
            <CardContent className="py-5">
              <p className="label-xs mb-2.5">Model Status</p>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={model.modelActive ? "success" : "warning"} dot>
                  {model.modelActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-xs text-text-tertiary">v{model.version ?? "—"}</p>
              <p className="text-xs text-text-tertiary">Trained {fmtDate(model.trainedAt)}</p>
            </CardContent>
          </Card>
          {/* Success rate */}
          <Card>
            <CardContent className="py-5">
              <p className="label-xs mb-2.5">Success Rate</p>
              <p className="text-2xl font-semibold text-text-primary tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                {summary.successRate ?? "—"}%
              </p>
              <p className="text-xs text-text-tertiary mt-1 mb-2">Saves + clicks / total</p>
              <Progress value={parseFloat(summary.successRate) || 0} variant="positive" />
            </CardContent>
          </Card>
          {/* Dismiss rate */}
          <Card>
            <CardContent className="py-5">
              <p className="label-xs mb-2.5">Dismiss Rate</p>
              <p className="text-2xl font-semibold text-text-primary tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                {summary.dismissRate ?? "—"}%
              </p>
              <p className="text-xs text-text-tertiary mt-1 mb-2">Dismissals / total</p>
              <Progress value={parseFloat(summary.dismissRate) || 0} variant="negative" />
            </CardContent>
          </Card>
          {/* Total interactions */}
          <Card>
            <CardContent className="py-5">
              <p className="label-xs mb-2.5">Total Interactions</p>
              <p className="text-2xl font-semibold text-text-primary tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                {summary.totalInteractions?.toLocaleString() ?? "—"}
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                {summary.saves ?? 0} saves · {summary.clicks ?? 0} clicks · {summary.dismisses ?? 0} dismisses
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts & Experiments */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Category bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>Category Success Rates</CardTitle>
            <span className="text-xs text-text-tertiary">Top place types by interaction success</span>
          </CardHeader>
          <CardContent className="pt-1">
            {categoryPerf.length === 0 ? (
              <div className="empty-state">
                <Brain className="h-8 w-8 opacity-30" />
                <p className="text-sm text-text-tertiary mt-2">No data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryPerf} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eeede9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#a8a29e" }} unit="%" axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: "#78716c" }} width={72} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {categoryPerf.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? "#16a34a" : "#78716c"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* A/B Experiments */}
        <Card>
          <CardHeader>
            <CardTitle>A/B Experiment Results</CardTitle>
            <span className="text-xs text-text-tertiary">Variant performance comparison</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {["variantA", "variantB"].map((key, i) => {
              const v = experiments[key] ?? {};
              return (
                <div key={key} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">Variant {i === 0 ? "A" : "B"}</p>
                      <p className="text-xs text-text-tertiary">{v.count ?? 0} interactions</p>
                    </div>
                    <p className="text-xl font-semibold text-text-primary tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                      {v.score ?? "—"}%
                    </p>
                  </div>
                  <Progress value={parseFloat(v.score) || 0} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Category detail table */}
      <Card>
        <CardHeader>
          <CardTitle>Category Performance Detail</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                {["Category", "Total", "Successes", "Rate"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left" style={{ background: "var(--color-surface-overlay)" }}>
                    <span className="label-xs">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
                : categoryPerf.length === 0
                ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-text-tertiary">No data available</td>
                  </tr>
                )
                : categoryPerf.map((row) => (
                  <tr key={row.category} className="table-row-hover" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                    <td className="px-4 py-3 text-xs font-medium text-text-primary capitalize">{row.category}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary tabular-nums">{row.successes}</td>
                    <td className="px-4 py-3">
                      <Badge variant={parseFloat(row.rate) > 50 ? "success" : "default"}>
                        {row.rate}%
                      </Badge>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>

      {/* Action log */}
      <Card>
        <CardHeader>
          <CardTitle>Action Log</CardTitle>
        </CardHeader>
        <CardContent>
          {actionLog.length === 0 ? (
            <p className="text-sm text-text-tertiary">No AI actions performed this session.</p>
          ) : (
            <div className="space-y-0 font-mono">
              {actionLog.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                  <span className="text-xs text-text-secondary">{entry.msg}</span>
                  <span className="text-[10px] text-text-tertiary shrink-0 ml-4">{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
