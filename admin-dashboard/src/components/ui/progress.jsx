import { cn } from "@/utils/cn";

export function Progress({ value = 0, className, colorClass = "bg-gradient-to-r from-indigo-500 to-violet-500", ...props }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
