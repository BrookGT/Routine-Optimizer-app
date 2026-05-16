import { useQuery } from "@tanstack/react-query";
import { getRoutines } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";

const WEEKDAY_LABELS = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const TIME_COLORS = {
  morning: "bg-amber-100 text-amber-700",
  afternoon: "bg-sky-100 text-sky-700",
  evening: "bg-violet-100 text-violet-700",
  night: "bg-slate-100 text-slate-700",
};

function formatDate(v) {
  if (!v) return "--";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export default function RoutinesPage() {
  const routinesQuery = useQuery({
    queryKey: ["routines"],
    queryFn: getRoutines,
    refetchInterval: 30000,
  });

  const routines = routinesQuery.data?.data ?? [];

  const summary = {
    total: routines.length,
    byTime: routines.reduce((acc, r) => {
      const t = r.timeOfDay ?? "unknown";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {}),
    byActivity: routines.reduce((acc, r) => {
      const a = r.activityType ?? "unknown";
      acc[a] = (acc[a] || 0) + 1;
      return acc;
    }, {}),
  };

  const topActivities = Object.entries(summary.byActivity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Routines Overview</h2>
          <p className="text-sm text-slate-500">
            {routines.length > 0
              ? `${routines.length} routines logged across all users`
              : "Aggregated routine data from all users"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => routinesQuery.refetch()}>
          Refresh
        </Button>
      </div>

      {routinesQuery.isLoading && <LoadingState label="Loading routines..." />}
      {routinesQuery.isError && (
        <Alert variant="error">{routinesQuery.error?.message}</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Total Routines</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{summary.total}</p>
          </CardContent>
        </Card>
        {Object.entries(summary.byTime).map(([time, count]) => (
          <Card key={time}>
            <CardHeader>
              <CardTitle className="text-sm text-slate-500 capitalize">{time} Routines</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Activities</CardTitle>
            <p className="text-xs text-slate-500">Most common routine activity types</p>
          </CardHeader>
          <CardContent>
            {topActivities.length === 0 ? (
              <p className="text-sm text-slate-400">No activity data yet.</p>
            ) : (
              <div className="space-y-3">
                {topActivities.map(([activity, count], i) => (
                  <div key={activity} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-xs font-semibold text-slate-400">#{i + 1}</span>
                      <span className="capitalize font-medium text-slate-700">{activity}</span>
                    </div>
                    <span className="font-bold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time of Day Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(summary.byTime).length === 0 ? (
                <p className="text-sm text-slate-400">No data yet.</p>
              ) : (
                Object.entries(summary.byTime).map(([time, count]) => (
                  <div key={time} className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize w-24 text-center ${
                        TIME_COLORS[time] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {time}
                    </span>
                    <div className="flex-1 rounded-full bg-slate-100 h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${summary.total ? (count / summary.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-900 w-8 text-right">{count}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Routines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Weekday</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Location Pref</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Budget</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {routines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No routines found. Users create routines from the mobile app.
                    </td>
                  </tr>
                )}
                {routines.slice(0, 30).map((routine) => (
                  <tr key={routine.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900 capitalize">
                      {WEEKDAY_LABELS[routine.weekday] ?? routine.weekday ?? "--"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          TIME_COLORS[routine.timeOfDay] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {routine.timeOfDay ?? "--"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600 capitalize">{routine.activityType ?? "--"}</td>
                    <td className="px-4 py-2 text-slate-600 capitalize">{routine.locationPreference ?? "--"}</td>
                    <td className="px-4 py-2 text-slate-600">{routine.budgetRange ?? "--"}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{formatDate(routine.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
