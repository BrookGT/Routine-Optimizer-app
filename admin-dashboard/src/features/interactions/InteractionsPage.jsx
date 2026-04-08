import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getInteractions } from "@/services/endpoints";

const ACTION_VARIANTS = {
  view: "default",
  click: "default",
  save: "success",
  dismiss: "danger",
};

const ACTION_OPTIONS = ["all", "view", "click", "save", "dismiss"];

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getFriendlyError(error) {
  const raw = error?.message ?? "";
  const message = raw.toLowerCase();

  if (message.includes("unauthorized") || message.includes("authorization")) {
    return "You are not signed in. Add a Firebase ID token to load interactions.";
  }

  return raw || "Unable to load interactions right now.";
}

export default function InteractionsPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const interactionsQuery = useQuery({
    queryKey: ["interactions"],
    queryFn: () => getInteractions(),
    refetchInterval: 10000,
  });

  const interactions = interactionsQuery.data?.data ?? [];

  const filteredInteractions = useMemo(() => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    return interactions.filter((item) => {
      if (actionFilter !== "all" && item.actionType !== actionFilter) return false;

      if (start || end) {
        if (!item.createdAt) return false;
        const createdAt = new Date(item.createdAt);
        if (Number.isNaN(createdAt.getTime())) return false;
        if (start && createdAt < start) return false;
        if (end && createdAt > end) return false;
      }

      return true;
    });
  }, [interactions, actionFilter, startDate, endDate]);

  const breakdown = useMemo(() => {
    return filteredInteractions.reduce(
      (acc, item) => {
        if (item.actionType === "click") acc.click += 1;
        if (item.actionType === "save") acc.save += 1;
        if (item.actionType === "dismiss") acc.dismiss += 1;
        return acc;
      },
      { click: 0, save: 0, dismiss: 0 }
    );
  }, [filteredInteractions]);

  const totalActions = breakdown.click + breakdown.save + breakdown.dismiss;
  const getPercent = (value) => (totalActions ? (value / totalActions) * 100 : 0);

  const handleClear = () => {
    setActionFilter("all");
    setStartDate("");
    setEndDate("");
  };

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-slate-900">Interaction Analytics</h3>
        <p className="text-sm text-slate-500">Track how users engage with recommendations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Action Type
              </label>
              <select
                className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
                value={actionFilter}
                onChange={(event) => setActionFilter(event.target.value)}
              >
                {ACTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Start Date
              </label>
              <input
                type="date"
                className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                End Date
              </label>
              <input
                type="date"
                className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={handleClear}>
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {interactionsQuery.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {getFriendlyError(interactionsQuery.error)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clicks vs Saves vs Dismiss</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Clicks</span>
                <span className="font-semibold text-slate-900">{breakdown.click}</span>
              </div>
              <Progress value={getPercent(breakdown.click)} />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Saves</span>
                <span className="font-semibold text-slate-900">{breakdown.save}</span>
              </div>
              <Progress value={getPercent(breakdown.save)} className="[&>div]:bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Dismiss</span>
                <span className="font-semibold text-slate-900">{breakdown.dismiss}</span>
              </div>
              <Progress value={getPercent(breakdown.dismiss)} className="[&>div]:bg-rose-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>Total interactions</span>
              <span className="font-semibold text-slate-900">{interactions.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Filtered results</span>
              <span className="font-semibold text-slate-900">{filteredInteractions.length}</span>
            </div>
            <div className="text-xs text-slate-400">
              Updated every 10s. Adjust filters to explore behavior patterns.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Interaction Log</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredInteractions.length === 0 ? (
            <p className="text-sm text-slate-400">No interactions match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="pb-2 pr-4">Place</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2 pr-4">Score</th>
                    <th className="pb-2 pr-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {filteredInteractions.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-900">{item.placeId}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={ACTION_VARIANTS[item.actionType] || "default"}>
                          {item.actionType}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-semibold text-slate-900">{item.score}</td>
                      <td className="py-2 pr-4 text-slate-500">{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
