import { cn } from "@/utils/cn";

const variants = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger:  "bg-rose-50 text-rose-700 border border-rose-200",
  default: "bg-indigo-50 text-indigo-700 border border-indigo-200",
};

const dots = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger:  "bg-rose-500",
  default: "bg-indigo-500",
};

export function Badge({ variant = "default", dot = false, className, children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variants[variant] ?? variants.default,
        className
      )}
      {...props}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", dots[variant] ?? dots.default)} />
      )}
      {children}
    </span>
  );
}
