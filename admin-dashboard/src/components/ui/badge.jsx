import { cn } from "@/utils/cn";

const styles = {
  success: {
    wrap: "bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534]",
    dot:  "bg-positive",
    text: "text-[#166534]",
  },
  warning: {
    wrap: "bg-[#fffbeb] border border-[#fde68a] text-[#92400e]",
    dot:  "bg-warn",
    text: "text-[#92400e]",
  },
  danger: {
    wrap: "bg-[#fef2f2] border border-[#fecaca] text-[#991b1b]",
    dot:  "bg-negative",
    text: "text-[#991b1b]",
  },
  default: {
    wrap: "bg-surface-overlay border border-border text-text-secondary",
    dot:  "bg-text-tertiary",
    text: "text-text-secondary",
  },
  neutral: {
    wrap: "bg-surface-overlay border border-border text-text-secondary",
    dot:  "bg-text-tertiary",
    text: "text-text-secondary",
  },
  bronze: {
    wrap: "bg-[#fffbeb] border border-[#fde68a] text-[#92400e]",
    dot:  "bg-bronze-light",
    text: "text-[#92400e]",
  },
};

export function Badge({ variant = "default", dot = false, className, children, ...props }) {
  const s = styles[variant] ?? styles.default;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        s.wrap,
        className
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.dot)} />}
      {children}
    </span>
  );
}

export default Badge;
