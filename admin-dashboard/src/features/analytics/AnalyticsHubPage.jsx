import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { RefreshCw, TrendingUp, Users } from "lucide-react";
import { getAdminOnboardingInsights } from "@/services/endpoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, SkeletonCard } from "@/components/ui/loading";
import { Alert } from "@/components/ui/alert";

function toChartData(mapObj) {
  if (!mapObj) return [];
  return Object.entries(mapObj)
    .map(([name, count]) => ({ name, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-text-primary mb-1 capitalize">{label}</p>
      <p className="text-text-secondary tabular-nums">{payload[0]?.value} users</p>
    </div>
  );
};

function InsightChart({ title, subtitle, data, color = "#44403c" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle && <span className="text-xs text-text-tertiary">{subtitle}</span>}
      </CardHeader>
      <CardContent className="pt-1">
        {data.length === 0 ? (
          <p className="text-xs text-text-tertiary py-8 text-center">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eeede9" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "#a8a29e" }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis width={30} tick={{ fontSize: 10, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsHubPage() {
  const ob = useQuery({
    queryKey: ["admin-analytics-onboarding"],
    queryFn: getAdminOnboardingInsights,
  });

  const religionData = toChartData(ob.data?.religion);
  const budgetData   = toChartData(ob.data?.budgetRange);
  const tags         = ob.data?.topEventInterests ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Analytics</h2>
          <p className="page-sub">User onboarding insights and platform engagement data</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => ob.refetch()} disabled={ob.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${ob.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {ob.isError && <Alert variant="error">{ob.error?.message}</Alert>}

      {/* Summary cards */}
      {ob.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : ob.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Sample size",         value: ob.data.sampleSize ?? "—",             icon: Users },
            { label: "With routines",        value: ob.data.usersWithDailyRoutine ?? "—",  icon: TrendingUp },
            { label: "Interest categories",  value: tags.length,                            icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="label-xs mb-2">{label}</p>
                    <p className="text-2xl font-semibold text-text-primary tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                      {value}
                    </p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-overlay border border-border-subtle">
                    <Icon className="h-4 w-4 text-text-secondary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      {ob.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard className="h-72" />
          <SkeletonCard className="h-72" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <InsightChart
              title="Budget Signals"
              subtitle="Self-reported budget ranges"
              data={budgetData}
              color="#57534e"
            />
            <InsightChart
              title="Religion Preferences"
              subtitle="Rounded bucket counts"
              data={religionData}
              color="#78716c"
            />
          </div>

          {/* Interest tags */}
          {tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Event-Interest Tags</CardTitle>
                <span className="text-xs text-text-tertiary">Most frequent interest tags from user onboarding</span>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tags.map((item) => (
                    <div
                      key={item.tag}
                      className="flex items-center gap-1.5 rounded-full bg-surface-overlay border border-border px-3 py-1"
                    >
                      <span className="text-xs font-medium text-text-primary capitalize">{item.tag}</span>
                      <span
                        className="text-[10px] tabular-nums rounded-full px-1.5 py-0.5"
                        style={{ background: "var(--color-border)", color: "var(--color-text-2)" }}
                      >
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
