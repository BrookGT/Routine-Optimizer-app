export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
      {label}
    </div>
  );
}
