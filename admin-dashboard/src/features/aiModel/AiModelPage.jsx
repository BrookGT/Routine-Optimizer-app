import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminAiInsights,
  getAiStatus,
  resetAiModel,
  trainAiModel,
} from "@/services/endpoints";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { Progress } from "@/components/ui/progress";

function formatDate(v) {
  if (!v) return "--";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

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

  const trainMutation = useMutation({
    mutationFn: trainAiModel,
    onSuccess: (data) => {
      addLog("AI model training triggered: " + (data?.message ?? "success"));
      queryClient.invalidateQueries(["ai-insights"]);
      queryClient.invalidateQueries(["ai-status"]);
    },
    onError: (err) => addLog("Train error: " + err.message),
  });

  const resetMutation = useMutation({
    mutationFn: resetAiModel,
    onSuccess: (data) => {
      addLog("AI model reset: " + (data?.message ?? "success"));
      queryClient.invalidateQueries(["ai-insights"]);
      queryClient.invalidateQueries(["ai-status"]);
    },
    onError: (err) => addLog("Reset error: " + err.message),
  });

  const addLog = (message) => {
    setActionLog((prev) =>
      [{ id: crypto.randomUUID(), message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 8)
    );
  };

  const insights = insightsQuery.data?.data;
  const summary = insights?.summary ?? {};
  const categoryPerf = insights?.categoryPerformance ?? [];
  const experiments = insights?.experiments ?? {};
  const model = insights?.model ?? statusQuery.data?.data ?? {};

  const isBusy = trainMutation.isPending || resetMutation.isPending;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">AI Monitor</h2>
          <p className="text-sm text-slate-500">Recommendation quality, model health, and AI controls.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              insightsQuery.refetch();
              statusQuery.refetch();
            }}
          >
            Refresh
          </Button>
          <Button
            onClick={() => trainMutation.mutate()}
            disabled={isBusy}
            className="bg-sky-600 hover:bg-sky-700"
          >
            {trainMutation.isPending ? "Training..." : "Retrain AI"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => resetMutation.mutate()}
            disabled={isBusy}
            className="text-rose-600 border-rose-200 hover:bg-rose-50"
          >
            {resetMutation.isPending ? "Resetting..." : "Reset Model"}
          </Button>
        </div>
      </div>

      {(insightsQuery.isError || statusQuery.isError) && (
        <Alert variant="error">
          {insightsQuery.error?.message || statusQuery.error?.message}
        </Alert>
      )}

      {insightsQuery.isLoading && <LoadingState label="Loading AI insights..." />}

      {/* Model Status */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Model Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={model.modelActive ? "success" : "warning"} className="text-sm px-3 py-1">
              {model.modelActive ? "Active" : "Inactive"}
            </Badge>
            <p className="mt-2 text-xs text-slate-500">Version: {model.version ?? "--"}</p>
            <p className="text-xs text-slate-500">Trained: {formatDate(model.trainedAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{summary.successRate ?? "--"}%</p>
            <p className="mt-1 text-xs text-slate-500">Saves + clicks / total</p>
            <Progress value={parseFloat(summary.successRate) || 0} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Dismiss Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-rose-600">{summary.dismissRate ?? "--"}%</p>
            <p className="mt-1 text-xs text-slate-500">Dismissals / total</p>
            <Progress value={parseFloat(summary.dismissRate) || 0} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Total Interactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{summary.totalInteractions?.toLocaleString() ?? "--"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {summary.saves ?? 0} saves · {summary.clicks ?? 0} clicks · {summary.dismisses ?? 0} dismisses
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Category Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Category Success Rate</CardTitle>
            <p className="text-xs text-slate-500">Top 10 place types by interactions</p>
          </CardHeader>
          <CardContent>
            {categoryPerf.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={categoryPerf}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 12 }} width={70} />
                  <Tooltip formatter={(v) => [`${v}%`, "Success Rate"]} />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {categoryPerf.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? "#34d399" : "#38bdf8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Experiment A/B */}
        <Card>
          <CardHeader>
            <CardTitle>A/B Experiment Results</CardTitle>
            <p className="text-xs text-slate-500">Variant comparison</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">Variant A</p>
                  <p className="text-xs text-slate-500">{experiments.variantA?.count ?? 0} interactions</p>
                </div>
                <p className="text-2xl font-bold text-sky-600">{experiments.variantA?.score ?? "--"}%</p>
              </div>
              <Progress value={parseFloat(experiments.variantA?.score) || 0} className="mt-2" />
            </div>
            <div className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">Variant B</p>
                  <p className="text-xs text-slate-500">{experiments.variantB?.count ?? 0} interactions</p>
                </div>
                <p className="text-2xl font-bold text-violet-600">{experiments.variantB?.score ?? "--"}%</p>
              </div>
              <Progress value={parseFloat(experiments.variantB?.score) || 0} className="mt-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Category Performance Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Successes</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {categoryPerf.map((row) => (
                  <tr key={row.category} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium capitalize text-slate-900">{row.category}</td>
                    <td className="px-4 py-2 text-slate-600">{row.total}</td>
                    <td className="px-4 py-2 text-slate-600">{row.successes}</td>
                    <td className="px-4 py-2">
                      <Badge variant={parseFloat(row.rate) > 50 ? "success" : "default"}>
                        {row.rate}%
                      </Badge>
                    </td>
                  </tr>
                ))}
                {categoryPerf.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">No data.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Action Log */}
      <Card>
        <CardHeader>
          <CardTitle>Action Log</CardTitle>
        </CardHeader>
        <CardContent>
          {actionLog.length === 0 ? (
            <p className="text-sm text-slate-400">No AI actions performed yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {actionLog.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between border-b border-slate-50 pb-1 last:border-0">
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
