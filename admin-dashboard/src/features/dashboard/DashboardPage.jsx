import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Activity, AlertCircle, Clock, TrendingUp, Zap } from "lucide-react";
import { useFetch } from "@/hooks/useFetch";
import { endpoints } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";

const REFRESH_MS     = 5000;
const HISTORY_POINTS = 20;

function getBadgeVariant(status) {
  if (status === "ok")       return "success";
  if (status === "degraded") return "warning";
  if (status === "down")     return "danger";
  return "default";
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg text-xs">
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500 capitalize">{p.dataKey}</span>
          <span className="font-semibold text-slate-900 ml-1">{p.value}</span>
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

  const [history, setHistory] = useState(
    Array.from({ length: HISTORY_POINTS }, (_, i) => ({ t: i, req: 0, err: 0 }))
  );
  const lastRef = useRef({ request: null, error: null });
  const tickRef = useRef(0);

  useEffect(() => {
    if (!metrics) return;
    const totalErrors = (metrics.errorCount4xx || 0) + (metrics.errorCount5xx || 0);
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

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title">System Health</h2>
          <p className="page-sub">Real-time API status and performance metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={getBadgeVariant(status)} dot className="px-3 py-1 text-sm capitalize">
            {status}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { healthQuery.refetch(); metricsQuery.refetch(); }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {(healthQuery.isError || metricsQuery.isError) && (
        <Alert variant="error">
          {healthQuery.error?.message || metricsQuery.error?.message || "Failed to load metrics."}
        </Alert>
      )}

      {metricsQuery.isLoading && <LoadingState label="Loading system metrics…" />}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Requests"
          value={metrics?.requestCount?.toLocaleString() ?? "--"}
          sub="All-time API calls"
          icon={Activity}
          gradient="from-indigo-500 to-violet-500"
        />
        <StatCard
          title="Error Count"
          value={errorCount.toLocaleString()}
          sub="4xx + 5xx combined"
          icon={AlertCircle}
          gradient={errorCount > 10 ? "from-rose-500 to-red-500" : "from-emerald-500 to-teal-500"}
        />
        <StatCard
          title="Error Rate"
          value={`${errorRate.toFixed(2)}%`}
          sub="Errors / requests"
          icon={TrendingUp}
          gradient={errorRate > 5 ? "from-amber-500 to-orange-500" : "from-sky-500 to-blue-500"}
        />
        <StatCard
          title="P95 Latency"
          value={metrics?.p95Ms != null ? `${metrics.p95Ms} ms` : "--"}
          sub="95th-percentile response"
          icon={Clock}
          gradient="from-purple-500 to-violet-500"
        />
      </div>

      {/* Error rate bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Error Rate Indicator</span>
            <span className="text-xs font-bold text-slate-700">{errorRate.toFixed(2)}%</span>
          </div>
          <Progress
            value={Math.min(100, errorRate)}
            colorClass={errorRate > 10 ? "bg-gradient-to-r from-rose-500 to-red-500" : errorRate > 3 ? "bg-gradient-to-r from-amber-400 to-orange-400" : "bg-gradient-to-r from-emerald-500 to-teal-500"}
          />
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Request Volume</CardTitle>
            <span className="text-xs text-slate-400">Rolling {HISTORY_POINTS} polls · {updatedAt}</span>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="req" stroke="#6366f1" strokeWidth={2} fill="url(#gReq)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Error Volume</CardTitle>
            <span className="text-xs text-slate-400">Rolling {HISTORY_POINTS} polls</span>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gErr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="err" stroke="#f43f5e" strokeWidth={2} fill="url(#gErr)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Env info */}
      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="dot-live" />
            Auto-refreshes every 5s
          </span>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Environment", value: health?.environment ?? "--" },
            { label: "Message",     value: health?.message     ?? "--" },
            { label: "Firestore",   value: health?.firestore   ?? "--" },
            { label: "Last Poll",   value: updatedAt },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
