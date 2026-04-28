import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { getExperimentMetrics } from "@/services/endpoints";

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${(value * 100).toFixed(2)}%`;
}

function getFriendlyError(error) {
  const raw = error?.message ?? "";
  const message = raw.toLowerCase();
  if (message.includes("development")) {
    return "Experiment metrics are only available in development mode.";
  }
  return raw || "Unable to load experiment metrics.";
}

function getVariantBlock(metrics, label) {
  if (!metrics) return null;
  return {
    label,
    ctr: metrics.ctr ?? metrics.clickRate ?? metrics.ctrRate ?? 0,
    saveRate: metrics.saveRate ?? metrics.save_rate ?? 0,
    dismissRate: metrics.dismissRate ?? metrics.dismiss_rate ?? 0,
  };
}

export default function ExperimentsPage() {
  const metricsQuery = useQuery({
    queryKey: ["experiment-metrics"],
    queryFn: () => getExperimentMetrics(),
  });

  const metrics = metricsQuery.data?.data ?? {};
  const variantA = getVariantBlock(metrics.variantA ?? metrics.A, "Variant A");
  const variantB = getVariantBlock(metrics.variantB ?? metrics.B, "Variant B");

  const winner = useMemo(() => {
    if (!variantA || !variantB) return null;
    if (variantA.ctr === variantB.ctr) return "Tie";
    return variantA.ctr > variantB.ctr ? "Variant A" : "Variant B";
  }, [variantA, variantB]);

  const maxCtr = Math.max(variantA?.ctr ?? 0, variantB?.ctr ?? 0, 0.0001);
  const maxSave = Math.max(variantA?.saveRate ?? 0, variantB?.saveRate ?? 0, 0.0001);
  const maxDismiss = Math.max(variantA?.dismissRate ?? 0, variantB?.dismissRate ?? 0, 0.0001);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Experiments</h3>
          <p className="text-sm text-slate-500">Monitor A/B variants and compare engagement outcomes.</p>
        </div>
        <Button variant="secondary" onClick={() => metricsQuery.refetch()}>
          Refresh
        </Button>
      </div>

      {metricsQuery.isError && (
        <Alert variant="error">{getFriendlyError(metricsQuery.error)}</Alert>
      )}

      {metricsQuery.isLoading && <LoadingState label="Loading experiment metrics..." />}

      <Card>
        <CardHeader>
          <CardTitle>Winner</CardTitle>
          {winner && <Badge variant={winner === "Tie" ? "warning" : "success"}>{winner}</Badge>}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Winner is based on CTR. Adjust experiment duration or sample size for confidence.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {[variantA, variantB].map((variant) => (
          <Card key={variant?.label ?? "variant"}>
            <CardHeader>
              <CardTitle>{variant?.label ?? "Variant"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">CTR</span>
                  <span className="font-semibold text-slate-900">{formatPercent(variant?.ctr)}</span>
                </div>
                <Progress value={((variant?.ctr ?? 0) / maxCtr) * 100} />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Save rate</span>
                  <span className="font-semibold text-slate-900">{formatPercent(variant?.saveRate)}</span>
                </div>
                <Progress value={((variant?.saveRate ?? 0) / maxSave) * 100} className="[&>div]:bg-emerald-500" />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Dismiss rate</span>
                  <span className="font-semibold text-slate-900">{formatPercent(variant?.dismissRate)}</span>
                </div>
                <Progress value={((variant?.dismissRate ?? 0) / maxDismiss) * 100} className="[&>div]:bg-rose-500" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
