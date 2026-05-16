import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export function LoadingState({ label = "Loading...", className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-slate-400", className)}>
      <div className="relative">
        <div className="h-10 w-10 rounded-full border-2 border-indigo-100" />
        <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
      </div>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-slate-100", className)} />
  );
}
