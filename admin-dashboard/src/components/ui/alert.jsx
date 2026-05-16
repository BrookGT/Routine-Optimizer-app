import { cn } from "@/utils/cn";

const variants = {
  error:   "bg-rose-50 border border-rose-200 text-rose-700",
  info:    "bg-indigo-50 border border-indigo-200 text-indigo-700",
  success: "bg-emerald-50 border border-emerald-200 text-emerald-700",
  warning: "bg-amber-50 border border-amber-200 text-amber-700",
};

const icons = {
  error:   "✕",
  info:    "ℹ",
  success: "✓",
  warning: "⚠",
};

const iconColors = {
  error:   "bg-rose-100 text-rose-600",
  info:    "bg-indigo-100 text-indigo-600",
  success: "bg-emerald-100 text-emerald-600",
  warning: "bg-amber-100 text-amber-600",
};

export function Alert({ variant = "info", title, children, className }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl p-3.5 text-sm", variants[variant], className)}>
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          iconColors[variant]
        )}
      >
        {icons[variant]}
      </span>
      <div>
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <p className="leading-snug">{children}</p>
      </div>
    </div>
  );
}
