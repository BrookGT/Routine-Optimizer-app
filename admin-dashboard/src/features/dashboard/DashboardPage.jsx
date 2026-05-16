import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Activity, AlertCircle, Clock, RefreshCw, TrendingUp } from "lucide-react";
import { useFetch } from "@/hooks/useFetch";
import { endpoints } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { LoadingState, SkeletonCard } from "@/components/ui/loading";

const REFRESH_MS     = 5000;
const HISTORY_POINTS = 20;

function getStatusBadge(status) {
  if (status === "ok")       return { variant: "success", label: "Healthy" };
  if (status === "degraded") return { variant: "warning", label: "Degraded" };
  if (status === "down")     return { variant: "danger",  label: "Down" };
  return { variant: "default", label: "Unknown" };
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-md text-xs">
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-text-tertiary capitalize">{p.dataKey}</span>
          <span className="font-semibold text-text-primary ml-auto pl-3 tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const healthQuery  = useFetch(["health"],  endpoints.health,  { refetchInterval: REFRESH_MS });
  const metricsQuery = useFetch(["metrics"], endpoints.metrics, { refetchInterval: REFRESH_MS });

  const metrics = metricsQuery.data?.data;
  const health  = healthQuery.data?.data;
  const status  = health?.status ?? "unknown";
  const badge   = getStatusBadge(status);

  const [history, setHistory] = useState(
    Array.from({ length: HISTORY_POINTS }, (_, i) => ({ t: i, req: 0, err: 0 }))
  );
  const lastRef = useRef({ request: null, error: null });
  const tickRef = useRef(0);

  useEffect(() => {
    if (!metrics) return;
    const totalErrors  = (metrics.errorCount4xx || 0) + (metrics.errorCount5xx || 0);
    const requestCount = metrics.requestCount || 0;
    const reqDelta = lastRef.current.request === null ? requestCount : Math.max(0, requestCount - lastRef.current.request);
    const errDelta = lastRef.current.error   === null ? totalErrors  : Math.max(0, totalErrors  - lastRef.current.error);
    lastRef.current = { request: requestCount, error: totalErrors };
    tickRef.current += 1;
    setHistory((prev) => [...prev, { t: tickRef.current, req: reqDelta, err: errDelta }].slice(-HISTORY_POINTS));
  }, [metrics]);

  const errorCount = useMemo(() => (metrics?.errorCount4xx || 0) + (metrics?.errorCount5xx || 0), [metrics]);
  const errorRate  = useMemo(() => {
    if (!metrics?.requestCount) return 0;
    return (errorCount / metrics.requestCount) * 100;
  }, [metrics, errorCount]);

  const updatedAt = metricsQuery.dataUpdatedAt
    ? new Date(metricsQuery.dataUpdatedAt).toLocaleTimeString()
    : "--";

  const isLoading = metricsQuery.isLoading || healthQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">System Health</h2>
          <p className="page-sub">Real-time API status and performance metrics</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Badge variant={badge.variant} dot>
            {badge.label}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { healthQuery.refetch(); metricsQuery.refetch(); }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {(healthQuery.isError || metricsQuery.isError) && (
        <Alert variant="error">
          {healthQuery.error?.message || metricsQuery.error?.message || "Failed to load metrics."}
        </Alert>
      )}

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Requests"
            value={metrics?.requestCount?.toLocaleString() ?? "—"}
            sub="All-time API calls"
            icon={Activity}
          />
          <StatCard
            title="Total Errors"
            value={errorCount.toLocaleString()}
            sub="4xx + 5xx combined"
            icon={AlertCircle}
          />
          <StatCard
            title="Error Rate"
            value={`${errorRate.toFixed(2)}%`}
            sub="Errors / total requests"
            icon={TrendingUp}
          />
          <StatCard
            title="P95 Latency"
            value={metrics?.p95Ms != null ? `${metrics.p95Ms} ms` : "—"}
            sub="95th-percentile response"
            icon={Clock}
          />
        </div>
      )}

      {/* Error rate progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="label-xs">Error Rate</span>
            <span className="text-xs font-semibold text-text-primary tabular-nums">{errorRate.toFixed(2)}%</span>
          </div>
          <Progress
            value={Math.min(100, errorRate)}
            variant={errorRate > 10 ? "negative" : errorRate > 3 ? "warn" : "positive"}
          />
          <p className="mt-2 text-xs text-text-tertiary">
            {errorRate > 10
              ? "High error rate — investigate immediately"
              : errorRate > 3
              ? "Elevated error rate — monitor closely"
              : "Error rate is within normal range"}
          </p>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Request Volume</CardTitle>
            <span className="text-xs text-text-tertiary">Rolling {HISTORY_POINTS} polls · {updatedAt}</span>
          </CardHeader>
          <CardContent className="pt-1">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#44403c" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#44403c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeede9" />
                <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="req"
                  stroke="#44403c"
                  strokeWidth={1.5}
                  fill="url(#gReq)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Error Volume</CardTitle>
            <span className="text-xs text-text-tertiary">Rolling {HISTORY_POINTS} polls</span>
          </CardHeader>
          <CardContent className="pt-1">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gErr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeede9" />
                <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="err"
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  fill="url(#gErr)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Environment info */}
      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span className="dot-live" />
            Auto-refreshes every 5 s
          </span>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Environment", value: health?.environment ?? "—" },
              { label: "Status",      value: health?.message     ?? "—" },
              { label: "Firestore",   value: health?.firestore   ?? "—" },
              { label: "Last poll",   value: updatedAt },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="label-xs mb-1">{label}</dt>
                <dd className="text-sm font-medium text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
