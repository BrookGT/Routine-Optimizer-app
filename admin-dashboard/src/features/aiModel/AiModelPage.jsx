import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { getModelStatus, getRecommendations } from "@/services/endpoints";

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value) {
  if (typeof value !== "number") return value ?? "--";
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}

function getFriendlyError(error) {
  const raw = error?.message ?? "";
  const message = raw.toLowerCase();
  if (message.includes("unauthorized") || message.includes("authorization")) {
    return "You are not signed in. Add a Firebase ID token to read recommendation AI metadata.";
  }
  if (message.includes("development")) {
    return "Model status is only available in development mode.";
  }
  return raw || "Unable to load model telemetry.";
}

export default function AiModelPage() {
  const modelQuery = useQuery({
    queryKey: ["model-status"],
    queryFn: () => getModelStatus(),
  });

  const recMetaQuery = useQuery({
    queryKey: ["recommendation-meta-ai"],
    queryFn: () => getRecommendations({ fast: true }),
    enabled: false,
  });

  const model = modelQuery.data?.data;
  const metaAi = recMetaQuery.data?.meta?.ai;

  const weightSummary = useMemo(() => {
    const weights = Array.isArray(model?.weights) ? model.weights : [];
    return {
      count: weights.length,
      preview: weights.slice(0, 8).map((value) => formatNumber(value)),
    };
  }, [model]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">AI Model</h3>
          <p className="text-sm text-slate-500">Track model health, training status, and inference metadata.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => modelQuery.refetch()}>
            Refresh Model
          </Button>
          <Button onClick={() => recMetaQuery.refetch()}>Fetch Meta.ai</Button>
        </div>
      </div>

      {(modelQuery.isError || recMetaQuery.isError) && (
        <Alert variant="error">{getFriendlyError(modelQuery.error || recMetaQuery.error)}</Alert>
      )}

      {modelQuery.isLoading && <LoadingState label="Loading model telemetry..." />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Model Status</CardTitle>
            <Badge variant={model?.modelActive ? "success" : "warning"}>
              {model?.modelActive ? "Active" : "Untrained"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Version</p>
              <p className="font-semibold text-slate-900">{model?.version ?? "--"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Last Trained</p>
              <p className="font-semibold text-slate-900">{formatDate(model?.trainedAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Loss</p>
              <p className="font-semibold text-slate-900">{formatNumber(model?.finalLoss)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>Total weights</span>
              <span className="font-semibold text-slate-900">{weightSummary.count}</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Preview</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {weightSummary.preview.length === 0 && (
                  <span className="text-slate-400">No weights yet</span>
                )}
                {weightSummary.preview.map((value, index) => (
                  <Badge key={`weight-${index}`} variant="default">
                    {value}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meta.ai (Recommendations)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>Model Active</span>
              <span className="font-semibold text-slate-900">
                {metaAi?.modelActive != null ? String(metaAi.modelActive) : "--"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Model Version</span>
              <span className="font-semibold text-slate-900">{metaAi?.modelVersion ?? "--"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Sample Count</span>
              <span className="font-semibold text-slate-900">{metaAi?.sampleCount ?? "--"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last Trained</span>
              <span className="font-semibold text-slate-900">{formatDate(metaAi?.lastTrainedAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
