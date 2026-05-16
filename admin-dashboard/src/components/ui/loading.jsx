import { cn } from "@/utils/cn";

/* ── Shimmer skeleton block ─────────────────────────────────────────────── */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("skeleton", className)}
      style={{
        background: "linear-gradient(90deg, #f0efed 0px, #e5e4e0 200px, #f0efed 400px)",
        backgroundSize: "600px 100%",
        animation: "shimmer 1.6s ease-in-out infinite",
      }}
      {...props}
    />
  );
}

/* ── Full-page / section loading state ─────────────────────────────────── */
export function LoadingState({ label = "Loading…", className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-text-tertiary", className)}>
      <div className="relative h-8 w-8">
        <div className="h-8 w-8 rounded-full border-2 border-border" />
        <div className="absolute inset-0 h-8 w-8 rounded-full border-2 border-transparent border-t-text-secondary animate-spin" />
      </div>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}

/* ── Skeleton card grid  ─────────────────────────────────────────────────── */
export function SkeletonCard({ className }) {
  return (
    <div className={cn("rounded-xl border border-border bg-white p-5 space-y-3", className)}>
      <Skeleton className="h-3 w-24 rounded" />
      <Skeleton className="h-7 w-32 rounded" />
      <Skeleton className="h-2.5 w-20 rounded" />
    </div>
  );
}

/* ── Skeleton table rows ─────────────────────────────────────────────────── */
export function SkeletonRow({ cols = 4 }) {
  return (
    <tr className="border-b border-border-subtle">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-3.5 rounded" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

/* ── Inline spinner ─────────────────────────────────────────────────────── */
export function Spinner({ className }) {
  return (
    <div
      className={cn(
        "h-4 w-4 rounded-full border-2 border-border border-t-text-secondary animate-spin",
        className
      )}
    />
  );
}

export default LoadingState;
