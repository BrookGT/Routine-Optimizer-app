import { useEffect, useMemo, useRef, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { endpoints } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const REFRESH_MS = 5000;
const HISTORY_POINTS = 12;

function getBadgeVariant(status) {
  if (status === "ok") return "success";
  if (status === "degraded") return "warning";
  if (status === "down") return "danger";
  return "default";
}

function formatNumber(value) {
  if (typeof value !== "number") return "--";
  return value.toLocaleString();
}

function formatMs(value) {
  if (typeof value !== "number") return "--";
  return `${value} ms`;
}

function MiniBarChart({ title, subtitle, data, accentClass }) {
  const maxValue = Math.max(1, ...data);
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-24 items-end gap-2">
          {data.map((point, index) => (
            <div key={`${title}-${index}`} className="flex-1">
              <div
                className={`w-full rounded-md ${accentClass}`}
                style={{ height: `${Math.max(6, (point / maxValue) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const healthQuery = useFetch(["health"], endpoints.health, {
    refetchInterval: REFRESH_MS,
  });
  const metricsQuery = useFetch(["metrics"], endpoints.metrics, {
    refetchInterval: REFRESH_MS,
  });

  const metrics = metricsQuery.data?.data;
  const health = healthQuery.data?.data;
  const status = health?.status ?? "unknown";

  const [requestHistory, setRequestHistory] = useState(
    Array.from({ length: HISTORY_POINTS }, () => 0)
  );
  const [errorHistory, setErrorHistory] = useState(
    Array.from({ length: HISTORY_POINTS }, () => 0)
  );
  const lastCountsRef = useRef({ request: null, error: null });

  useEffect(() => {
    if (!metrics) return;
    const totalErrors = (metrics.errorCount4xx || 0) + (metrics.errorCount5xx || 0);
    const requestCount = metrics.requestCount || 0;

    const lastRequest = lastCountsRef.current.request;
    const lastError = lastCountsRef.current.error;
    const requestDelta = lastRequest === null ? requestCount : Math.max(0, requestCount - lastRequest);
    const errorDelta = lastError === null ? totalErrors : Math.max(0, totalErrors - lastError);

    lastCountsRef.current = { request: requestCount, error: totalErrors };

    setRequestHistory((prev) => [...prev, requestDelta].slice(-HISTORY_POINTS));
    setErrorHistory((prev) => [...prev, errorDelta].slice(-HISTORY_POINTS));
  }, [metrics]);

  const errorCount = useMemo(() => {
    return (metrics?.errorCount4xx || 0) + (metrics?.errorCount5xx || 0);
  }, [metrics]);

  const errorRate = useMemo(() => {
    if (!metrics?.requestCount) return 0;
    return (errorCount / metrics.requestCount) * 100;
  }, [metrics, errorCount]);

  const updatedAt = metricsQuery.dataUpdatedAt
    ? new Date(metricsQuery.dataUpdatedAt).toLocaleTimeString()
    : "--";

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Dashboard</h3>
          <p className="text-sm text-slate-500">Live system telemetry updated at {updatedAt}.</p>
        </div>
        <Badge variant={getBadgeVariant(status)}>{status}</Badge>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <Badge variant={getBadgeVariant(status)}>{status}</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">Environment: {health?.environment ?? "--"}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {healthQuery.isLoading
                ? "Checking..."
                : healthQuery.data?.message || "Health ready"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request Count</CardTitle>
            <p className="text-xs text-slate-500">Last interval</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">
              {formatNumber(metrics?.requestCount)}
            </p>
            <p className="mt-2 text-sm text-slate-500">Total requests observed.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Error Rate</CardTitle>
            <p className="text-xs text-slate-500">4xx + 5xx</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{errorRate.toFixed(2)}%</p>
            <p className="mt-2 text-sm text-slate-500">{formatNumber(errorCount)} errors total.</p>
            <div className="mt-3">
              <Progress value={errorRate} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>P95 Latency</CardTitle>
            <p className="text-xs text-slate-500">Millisecond response</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{formatMs(metrics?.p95Ms)}</p>
            <p className="mt-2 text-sm text-slate-500">95th percentile response time.</p>
          </CardContent>
        </Card>
      </div>

      {(healthQuery.isError || metricsQuery.isError) && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {healthQuery.error?.message || metricsQuery.error?.message || "Failed to load metrics."}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <MiniBarChart
          title="Requests Over Time"
          subtitle="Rolling 60s window"
          data={requestHistory}
          accentClass="bg-sky-500"
        />
        <MiniBarChart
          title="Errors Over Time"
          subtitle="Rolling 60s window"
          data={errorHistory}
          accentClass="bg-rose-500"
        />
      </div>
    </section>
  );
}
