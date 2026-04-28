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
  if (typeof value !== "number") return value ?? "--";
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function getFriendlyError(error) {
  const raw = error?.message ?? "";
  const message = raw.toLowerCase();
  if (message.includes("unauthorized") || message.includes("authorization")) {
    return "You are not signed in. Add a Firebase ID token to fetch recommendations.";
  }
  return raw || "Unable to load recommendations right now.";
}

export default function RecommendationsPage() {
  const [expandedId, setExpandedId] = useState(null);

  const recQuery = useQuery({
    queryKey: ["recommendations", "debug"],
    queryFn: () => getRecommendations({ debug: true }),
    enabled: false,
  });

  const recommendations = recQuery.data?.data?.recommendations ?? [];

  const breakdownList = useMemo(() => {
    return recommendations.map((item) => {
      const breakdown = item.scoreBreakdown ?? {};
      return {
        id: item.id,
        entries: Object.entries(breakdown).sort(([a], [b]) => a.localeCompare(b)),
      };
    });
  }, [recommendations]);

  const handleToggle = (id) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Recommendations</h3>
          <p className="text-sm text-slate-500">Inspect ranked recommendations with full debug scoring.</p>
        </div>
        <Button onClick={() => recQuery.refetch()}>Fetch Debug</Button>
      </div>

      {recQuery.isError && (
        <Alert variant="error">{getFriendlyError(recQuery.error)}</Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ranked Results</CardTitle>
        </CardHeader>
        <CardContent>
          {recQuery.isLoading && <LoadingState label="Loading recommendations..." />}
          {!recQuery.isLoading && recommendations.length === 0 && (
            <p className="text-sm text-slate-500">Click “Fetch Debug” to load recommendations.</p>
          )}

          {recommendations.length > 0 && (
            <div className="space-y-3">
              {recommendations.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm text-slate-500">{item.type ?? "Unknown type"}</p>
                      <h4 className="text-base font-semibold text-slate-900">{item.name}</h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="default">Score {formatNumber(item.score)}</Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggle(item.id)}
                      >
                        {expandedId === item.id ? "Hide" : "View"} Breakdown
                      </Button>
                    </div>
                  </div>

                  {expandedId === item.id && (
                    <div className="border-t border-slate-100 px-4 py-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {breakdownList
                          .find((entry) => entry.id === item.id)
                          ?.entries.map(([key, value]) => (
                            <div
                              key={`${item.id}-${key}`}
                              className={
                                isHighlighted(key)
                                  ? "rounded-lg border border-sky-200 bg-sky-50 p-3"
                                  : "rounded-lg border border-slate-100 bg-slate-50 p-3"
                              }
                            >
                              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                                {key}
                              </p>
                              <p className="text-lg font-semibold text-slate-900">{formatNumber(value)}</p>
                              {isHighlighted(key) && (
                                <p className="text-xs text-slate-500">Highlighted signal</p>
                              )}
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
    </section>
  );
}
