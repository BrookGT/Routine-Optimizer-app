import { cn } from "@/utils/cn";

function Card({ className, hover = false, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white shadow-sm",
        hover && "card-hover cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }) {
  return (
    <h4
      className={cn("text-sm font-semibold text-slate-700 leading-none", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

/* Gradient stat card */
function StatCard({ title, value, sub, icon: Icon, gradient = "from-indigo-500 to-violet-500", className }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.06] rounded-2xl`} />
      <CardContent className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
          </div>
          {Icon && (
            <div className={`rounded-xl bg-gradient-to-br ${gradient} p-2.5 shadow-sm`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { Card, CardHeader, CardTitle, CardContent, StatCard };
