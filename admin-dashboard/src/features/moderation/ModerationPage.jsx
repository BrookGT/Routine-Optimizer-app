import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, Shield, X } from "lucide-react";
import { getAdminEvents, deleteAdminEvent, updateAdminEvent } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState, SkeletonRow } from "@/components/ui/loading";

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

function EditEventForm({ event, isLoading, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: event.title ?? "", description: event.description ?? "",
    location: event.location ?? "", category: event.category ?? "other",
    date: event.date ? event.date.slice(0, 10) : "",
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const CATS = ["music", "tech", "church", "fitness", "business", "food", "sports", "other"];

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
      {["title", "location"].map((key) => (
        <div key={key} className="space-y-1">
          <label className="label-xs capitalize">{key}</label>
          <input className="input-base" value={form[key]} onChange={set(key)} />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="label-xs">Category</label>
          <select className="input-base" value={form.category} onChange={set("category")}>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="label-xs">Date</label>
          <input type="date" className="input-base" value={form.date} onChange={set("date")} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="label-xs">Description</label>
        <textarea rows={3} className="input-base" style={{ height: "auto" }} value={form.description} onChange={set("description")} />
      </div>
      <div className="flex gap-2.5 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isLoading}>{isLoading ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}

export default function ModerationPage() {
  const queryClient = useQueryClient();
  const [search,        setSearch]        = useState("");
  const [categoryFilter,setCategoryFilter]= useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editItem,      setEditItem]      = useState(null);

  const eventsQuery = useQuery({
    queryKey: ["moderation-events"],
    queryFn:  () => getAdminEvents({ limit: 100 }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAdminEvent,
    onSuccess:  () => { queryClient.invalidateQueries(["moderation-events"]); setConfirmDelete(null); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => updateAdminEvent(id, updates),
    onSuccess:  () => { queryClient.invalidateQueries(["moderation-events"]); setEditItem(null); },
  });

  const events    = eventsQuery.data?.data ?? [];
  const CATS      = [...new Set(events.map((e) => e.category).filter(Boolean))];
  const filtered  = events.filter((e) => {
    const matchSearch = !search.trim() ||
      e.title?.toLowerCase().includes(search.toLowerCase()) ||
      e.location?.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Moderation</h2>
          <p className="page-sub">Review, edit, and remove scraped events and flagged content</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => queryClient.invalidateQueries(["moderation-events"])} disabled={eventsQuery.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${eventsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {(deleteMutation.isError || updateMutation.isError) && (
        <Alert variant="error">{deleteMutation.error?.message || updateMutation.error?.message}</Alert>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
          <input className="input-base pl-9 w-56" placeholder="Search events…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input-base w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {eventsQuery.isError && <Alert variant="error">{eventsQuery.error?.message}</Alert>}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events ({filtered.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                {["Title", "Category", "Date", "Location", "Source", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left" style={{ background: "var(--color-surface-overlay)" }}>
                    <span className="label-xs">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventsQuery.isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-text-tertiary">
                        <Shield className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No items to moderate</p>
                      </div>
                    </td>
                  </tr>
                )
                : filtered.map((event) => (
                  <tr key={event.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                    <td className="px-4 py-3 text-xs font-medium text-text-primary max-w-[220px] truncate">{event.title ?? "—"}</td>
                    <td className="px-4 py-3"><Badge variant="default">{event.category ?? "other"}</Badge></td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{fmtDate(event.date)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary max-w-[160px] truncate">{event.location ?? "—"}</td>
                    <td className="px-4 py-3 text-[10px] text-text-tertiary">{event.source ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(event)}>Edit</Button>
                        <Button variant="ghost" size="xs" className="text-negative hover:bg-[#fef2f2]" onClick={() => setConfirmDelete(event)}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl p-6 animate-fade-in" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 16px 48px rgba(0,0,0,0.12)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary">Edit Event</h2>
              <button type="button" onClick={() => setEditItem(null)} className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay">
                <X className="h-4 w-4" />
              </button>
            </div>
            <EditEventForm event={editItem} isLoading={updateMutation.isPending} onCancel={() => setEditItem(null)} onSave={(updates) => updateMutation.mutate({ id: editItem.id, updates })} />
            {updateMutation.isError && <Alert variant="error" className="mt-3">{updateMutation.error?.message}</Alert>}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl p-6 space-y-4 animate-fade-in" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 16px 48px rgba(0,0,0,0.12)" }}>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-text-primary">Remove event?</h3>
              <p className="text-sm text-text-secondary">
                Permanently remove <strong className="text-text-primary">{confirmDelete.title}</strong>? This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={() => deleteMutation.mutate(confirmDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
