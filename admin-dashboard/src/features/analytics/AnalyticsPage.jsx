import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { getAdminAnalytics } from "@/services/endpoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";

const PIE_COLORS = [
  "#38bdf8", "#818cf8", "#34d399", "#fb923c", "#f472b6",
  "#a3e635", "#e879f9", "#facc15", "#94a3b8", "#6ee7b7",
];

function StatCard({ title, value, sub, colorClass = "text-slate-900" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const ACTION_COLORS = {
  view: "#38bdf8",
  click: "#818cf8",
  save: "#34d399",
  dismiss: "#f43f5e",
};

export default function AnalyticsPage() {
  const analyticsQuery = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: getAdminAnalytics,
    refetchInterval: 60000,
  });

  const data = analyticsQuery.data?.data;
  const totals = data?.totals ?? {};
  const actionBreakdown = data?.actionBreakdown ?? {};
  const topCategories = data?.topCategories ?? [];
  const dailyActivity = data?.dailyActivity ?? [];
  const recentUsers = data?.recentUsers ?? [];

  const actionChartData = Object.entries(actionBreakdown).map(([action, count]) => ({
    action,
    count,
    fill: ACTION_COLORS[action] ?? "#94a3b8",
  }));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Analytics</h2>
          <p className="text-sm text-slate-500">Platform-wide engagement and usage metrics.</p>
        </div>
        <Button variant="secondary" onClick={() => analyticsQuery.refetch()}>
          Refresh
        </Button>
      </div>

      {analyticsQuery.isLoading && <LoadingState label="Loading analytics..." />}
      {analyticsQuery.isError && (
        <Alert variant="error">{analyticsQuery.error?.message}</Alert>
      )}

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Users" value={totals.users?.toLocaleString() ?? "--"} sub="All registered users" />
        <StatCard title="Total Interactions" value={totals.interactions?.toLocaleString() ?? "--"} sub="All-time interactions" colorClass="text-sky-700" />
        <StatCard title="Places in Catalogue" value={totals.places?.toLocaleString() ?? "--"} sub="Active places" colorClass="text-emerald-700" />
        <StatCard title="Scraped Events" value={totals.events?.toLocaleString() ?? "--"} sub="All events" colorClass="text-violet-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Interaction Activity</CardTitle>
            <p className="text-xs text-slate-500">Last 14 days</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyActivity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [v, "Interactions"]} />
                <Line type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Action Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Action Breakdown</CardTitle>
            <p className="text-xs text-slate-500">Recent 500 interactions</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={actionChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="action" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {actionChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Top Categories by Interaction</CardTitle>
            <p className="text-xs text-slate-500">Most engaged place types</p>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={topCategories}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ category, percent }) =>
                      `${category} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {topCategories.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle>Recently Joined Users</CardTitle>
            <p className="text-xs text-slate-500">Last 10 signups</p>
          </CardHeader>
          <CardContent>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-slate-400">No users yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {recentUsers.map((u) => (
                  <div key={u.uid} className="flex items-center justify-between border-b border-slate-50 pb-1 last:border-0">
                    <span className="font-medium text-slate-700 truncate max-w-[200px]">
                      {u.email ?? u.uid}
                    </span>
                    <span className="text-xs text-slate-400">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "--"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
