import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RoutinesPage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Routines</h3>
          <p className="text-sm text-slate-500">Manage user routines</p>
        </div>
        <Button>New Routine</Button>
      </div>
      <Card>
        <CardContent>
          <p className="py-8 text-center text-sm text-slate-500">No routines configured.</p>
        </CardContent>
      </Card>
    </section>
  );
}
