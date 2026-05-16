import { cn } from "@/utils/cn";

/* ── Base card ─────────────────────────────────────────────────────────────── */
function Card({ className, hover = false, ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white border border-border",
        hover && "transition-shadow duration-200 hover:shadow-card-hover cursor-pointer",
        className
      )}
      style={{ boxShadow: "0 0 0 1px #e5e4e0" }}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }) {
  return (
    <h4
      className={cn("text-sm font-semibold text-text-primary leading-none", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }) {
  return (
    <p className={cn("text-xs text-text-tertiary mt-0.5", className)} {...props} />
  );
}

function CardContent({ className, ...props }) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn("flex items-center justify-between px-5 py-3 border-t border-border-subtle", className)}
      {...props}
    />
  );
}

/* ── Stat card ─────────────────────────────────────────────────────────────── */
function StatCard({ title, value, sub, icon: Icon, trend, trendLabel, className }) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="label-xs mb-2.5">{title}</p>
            <p className="text-2xl font-semibold tracking-tight text-text-primary tabular-nums" style={{ letterSpacing: "-0.02em" }}>
              {value}
            </p>
            {sub && (
              <p className="mt-1.5 text-xs text-text-tertiary">{sub}</p>
            )}
            {trend != null && (
              <div className={cn(
                "mt-2 inline-flex items-center gap-1 text-xs font-medium",
                isPositive && "text-positive",
                isNegative && "text-negative",
                !isPositive && !isNegative && "text-text-tertiary"
              )}>
                <span>{isPositive ? "↑" : isNegative ? "↓" : "→"}</span>
                <span>{Math.abs(trend)}%</span>
                {trendLabel && <span className="font-normal text-text-tertiary">{trendLabel}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay border border-border-subtle">
              <Icon className="h-4 w-4 text-text-secondary" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatCard };
