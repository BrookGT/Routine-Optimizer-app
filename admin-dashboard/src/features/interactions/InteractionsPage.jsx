import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
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
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Interactions</h2>
          <p className="page-sub">Track how users engage with recommendations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="label-xs">Action type</label>
          <select className="input-base w-32" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            {ACTION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="label-xs">Start date</label>
          <input type="date" className="input-base w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="label-xs">End date</label>
          <input type="date" className="input-base w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button variant="secondary" size="sm" onClick={handleClear}>Clear</Button>
      </div>

      {interactionsQuery.isLoading && <LoadingState label="Loading interactions…" />}
      {interactionsQuery.isError && <Alert variant="error">{getFriendlyError(interactionsQuery.error)}</Alert>}

      {/* Stats */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Action Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Clicks",  value: breakdown.click,   variant: "default" },
              { label: "Saves",   value: breakdown.save,    variant: "positive" },
              { label: "Dismiss", value: breakdown.dismiss, variant: "negative" },
            ].map(({ label, value, variant }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{label}</span>
                  <span className="font-medium text-text-primary tabular-nums">{value}</span>
                </div>
                <Progress value={getPercent(value)} variant={variant} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent>
            {[
              { label: "Total interactions", value: interactions.length.toLocaleString() },
              { label: "Filtered results",   value: filteredInteractions.length.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0">
                <span className="text-xs text-text-secondary">{label}</span>
                <span className="text-xs font-medium text-text-primary tabular-nums">{value}</span>
              </div>
            ))}
            <p className="text-xs text-text-tertiary mt-3">Updated every 10 s · adjust filters to explore behavior patterns</p>
          </CardContent>
        </Card>
      </div>

      {/* Log table */}
      <Card>
        <CardHeader><CardTitle>Interaction Log</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                {["Place ID", "Action", "Score", "Timestamp"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left" style={{ background: "var(--color-surface-overlay)" }}>
                    <span className="label-xs">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInteractions.length === 0
                ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-text-tertiary">
                      No interactions match the current filters.
                    </td>
                  </tr>
                )
                : filteredInteractions.map((item) => (
                  <tr key={item.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                    <td className="px-4 py-3 font-mono text-xs text-text-primary max-w-[180px] truncate">{item.placeId}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ACTION_VARIANTS[item.actionType] || "default"}>{item.actionType}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-text-primary tabular-nums">{item.score ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-tertiary">{formatDate(item.createdAt)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
