import { cn } from "@/utils/cn";

const variants = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-slate-200 bg-slate-50 text-slate-600",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
};

export function Alert({ variant = "info", title, children, className }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", variants[variant], className)}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}
