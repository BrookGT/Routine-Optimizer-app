import { cn } from "@/utils/cn";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const variants = {
  error:   { wrap: "bg-[#fef2f2] border-[#fecaca] text-[#991b1b]", Icon: AlertCircle },
  info:    { wrap: "bg-surface-overlay border-border text-text-secondary", Icon: Info },
  success: { wrap: "bg-[#f0fdf4] border-[#bbf7d0] text-[#166534]", Icon: CheckCircle2 },
  warning: { wrap: "bg-[#fffbeb] border-[#fde68a] text-[#92400e]", Icon: AlertTriangle },
};

export function Alert({ variant = "info", title, children, onDismiss, className }) {
  const { wrap, Icon } = variants[variant] ?? variants.info;
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", wrap, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <p className="leading-snug opacity-90">{children}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto -mr-1 -mt-0.5 rounded p-1 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
