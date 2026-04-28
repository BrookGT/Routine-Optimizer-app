import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DevToolsPage() {
  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-slate-900">Dev Tools</h3>
        <p className="text-sm text-slate-500">Development-only utilities (disabled in production).</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seed Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">Seed the Firestore places collection.</p>
            <Button variant="secondary">Run Seed</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Places</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">List all places currently in Firestore.</p>
            <Button variant="secondary">Fetch Places</Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
