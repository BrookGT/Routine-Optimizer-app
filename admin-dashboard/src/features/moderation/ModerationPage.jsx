import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminEvents, deleteAdminEvent, updateAdminEvent } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";

function formatDate(iso) {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function ModerationPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const eventsQuery = useQuery({
    queryKey: ["moderation-events"],
    queryFn: () => getAdminEvents({ limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminEvent,
    onSuccess: () => {
      queryClient.invalidateQueries(["moderation-events"]);
      setConfirmDelete(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => updateAdminEvent(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries(["moderation-events"]);
      setEditItem(null);
    },
  });

  const events = eventsQuery.data?.data ?? [];

  const CATEGORIES = [...new Set(events.map((e) => e.category).filter(Boolean))];

  const filtered = events.filter((e) => {
    const matchSearch =
      !search.trim() ||
      e.title?.toLowerCase().includes(search.toLowerCase()) ||
      e.location?.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const CATEGORY_COLORS = {
    music: "bg-purple-100 text-purple-700",
    tech: "bg-blue-100 text-blue-700",
    church: "bg-orange-100 text-orange-700",
    fitness: "bg-green-100 text-green-700",
    business: "bg-yellow-100 text-yellow-700",
    food: "bg-red-100 text-red-700",
    sports: "bg-cyan-100 text-cyan-700",
    other: "bg-slate-100 text-slate-600",
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Content Moderation</h2>
          <p className="text-sm text-slate-500">
            Review, edit, and remove scraped events and flagged content.
          </p>
        </div>
        <Button variant="secondary" onClick={() => queryClient.invalidateQueries(["moderation-events"])}>
          Refresh
        </Button>
      </div>

      {(deleteMutation.isError || updateMutation.isError) && (
        <Alert variant="error">
          {deleteMutation.error?.message || updateMutation.error?.message}
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          className="h-10 flex-1 min-w-[200px] rounded-lg border border-slate-200 px-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {eventsQuery.isLoading && <LoadingState label="Loading events..." />}
      {eventsQuery.isError && <Alert variant="error">{eventsQuery.error?.message}</Alert>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Events ({filtered.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">No events to moderate.</td>
                  </tr>
                )}
                {filtered.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                      {event.title ?? "--"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other
                        }`}
                      >
                        {event.category ?? "other"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(event.date)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[150px] truncate">{event.location ?? "--"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{event.source ?? "--"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditItem(event)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => setConfirmDelete(event)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Edit Event</h2>
            <EditEventForm
              event={editItem}
              isLoading={updateMutation.isPending}
              onCancel={() => setEditItem(null)}
              onSave={(updates) => updateMutation.mutate({ id: editItem.id, updates })}
            />
            {updateMutation.isError && (
              <Alert variant="error" className="mt-3">{updateMutation.error?.message}</Alert>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800">Remove Event?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Permanently remove <strong>{confirmDelete.title}</strong>?
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-rose-600 hover:bg-rose-700"
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EditEventForm({ event, isLoading, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: event.title ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    category: event.category ?? "other",
    date: event.date ? event.date.slice(0, 10) : "",
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="space-y-3"
    >
      {["title", "location"].map((key) => (
        <div key={key}>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 capitalize">
            {key}
          </label>
          <input className="input-field" value={form[key]} onChange={set(key)} />
        </div>
      ))}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Category</label>
        <select className="input-field" value={form.category} onChange={set("category")}>
          {["music", "tech", "church", "fitness", "business", "food", "sports", "other"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Date</label>
        <input type="date" className="input-field" value={form.date} onChange={set("date")} />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Description</label>
        <textarea rows={3} className="input-field resize-none" value={form.description} onChange={set("description")} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save"}</Button>
      </div>
    </form>
  );
}
