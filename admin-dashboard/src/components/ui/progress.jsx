import { cn } from "@/utils/cn";

export function Progress({
  value = 0,
  className,
  colorClass,
  variant = "default",
  ...props
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const trackMap = {
    default: "bg-surface-inset",
    positive: "bg-[#dcfce7]",
    warn: "bg-[#fef9c3]",
    negative: "bg-[#fee2e2]",
  };
  const barMap = {
    default: "bg-text-primary",
    positive: "bg-positive",
    warn: "bg-warn",
    negative: "bg-negative",
  };
  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full", trackMap[variant] ?? trackMap.default, className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorClass ?? barMap[variant] ?? barMap.default)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
