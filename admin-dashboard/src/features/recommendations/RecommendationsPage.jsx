import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { getRecommendations } from "@/services/endpoints";

const HIGHLIGHT_KEYS = ["modelscore", "modelboost", "explorationboost", "intentboost", "intentmatch"];

function isHighlighted(key) {
  return HIGHLIGHT_KEYS.some((term) => key.toLowerCase().includes(term));
}

function formatNumber(value) {
  if (typeof value !== "number") return value ?? "—";
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function getFriendlyError(error) {
  const raw = error?.message ?? "";
  const msg = raw.toLowerCase();
  if (msg.includes("unauthorized") || msg.includes("authorization"))
    return "You are not signed in. Add a Firebase ID token to fetch recommendations.";
  return raw || "Unable to load recommendations right now.";
}

export default function RecommendationsPage() {
  const [expandedId, setExpandedId] = useState(null);

  const recQuery = useQuery({
    queryKey: ["recommendations", "debug"],
    queryFn:  () => getRecommendations({ debug: true }),
    enabled:  false,
  });

  const recommendations = recQuery.data?.data?.recommendations ?? [];

  const breakdownList = useMemo(() =>
    recommendations.map((item) => ({
      id: item.id,
      entries: Object.entries(item.scoreBreakdown ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    })),
  [recommendations]);

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">Recommendations</h2>
          <p className="page-sub">Inspect ranked recommendations with full debug scoring</p>
        </div>
        <Button size="sm" onClick={() => recQuery.refetch()}>Fetch debug data</Button>
      </div>

      {recQuery.isError && <Alert variant="error">{getFriendlyError(recQuery.error)}</Alert>}

      <Card>
        <CardHeader><CardTitle>Ranked Results</CardTitle></CardHeader>
        <CardContent>
          {recQuery.isLoading && <LoadingState label="Loading recommendations…" />}
          {!recQuery.isLoading && recommendations.length === 0 && (
            <p className="text-sm text-text-tertiary">Click "Fetch debug data" to load recommendations.</p>
          )}

          {recommendations.length > 0 && (
            <div className="space-y-2.5">
              {recommendations.map((item) => (
                <div key={item.id} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-xs text-text-tertiary capitalize">{item.type ?? "Unknown type"}</p>
                      <h4 className="text-sm font-medium text-text-primary mt-0.5">{item.name}</h4>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Badge variant="default">Score {formatNumber(item.score)}</Badge>
                      <Button variant="ghost" size="xs" onClick={() => setExpandedId((cur) => cur === item.id ? null : item.id)}>
                        {expandedId === item.id ? "Hide" : "View"} breakdown
                      </Button>
                    </div>
                  </div>

                  {expandedId === item.id && (
                    <div className="border-t border-border-subtle px-4 py-4 bg-surface-overlay">
                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {breakdownList.find((e) => e.id === item.id)?.entries.map(([key, value]) => (
                          <div
                            key={`${item.id}-${key}`}
                            className={
                              isHighlighted(key)
                                ? "rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-3"
                                : "rounded-lg border border-border bg-white p-3"
                            }
                          >
                            <p className="label-xs mb-1">{key}</p>
                            <p className="text-base font-semibold text-text-primary tabular-nums">{formatNumber(value)}</p>
                            {isHighlighted(key) && <p className="text-[10px] text-positive mt-0.5">Key signal</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
