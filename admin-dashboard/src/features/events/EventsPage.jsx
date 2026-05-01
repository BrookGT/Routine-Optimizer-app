import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAdminEvent,
  getAdminEvents,
  getEventsStats,
  setEventFeatured,
  updateAdminEvent,
} from "@/services/endpoints";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const CATEGORY_COLORS = {
  music:     "bg-purple-100 text-purple-700",
  tech:      "bg-blue-100 text-blue-700",
  church:    "bg-orange-100 text-orange-700",
  fitness:   "bg-green-100 text-green-700",
  business:  "bg-yellow-100 text-yellow-700",
  food:      "bg-red-100 text-red-700",
  art:       "bg-pink-100 text-pink-700",
  sports:    "bg-cyan-100 text-cyan-700",
  education: "bg-indigo-100 text-indigo-700",
  social:    "bg-teal-100 text-teal-700",
  other:     "bg-slate-100 text-slate-600",
};

const SOURCE_LABELS = {
  alladdisevents:           "AllAddis Events",
  whatsupaddis:             "WhatsUp Addis",
  telegram_events_ethiopia: "Telegram",
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ event, onClose, onSave }) {
  const [form, setForm] = useState({
    title:       event.title || "",
    description: event.description || "",
    location:    event.location || "",
    category:    event.category || "other",
    date:        event.date ? event.date.slice(0, 10) : "",
    image:       event.image || "",
    source_url:  event.source_url || "",
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Edit Event</h2>

        <div className="space-y-3">
          {[
            { label: "Title",       key: "title" },
            { label: "Location",    key: "location" },
            { label: "Image URL",   key: "image" },
            { label: "Source URL",  key: "source_url" },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {label}
              </label>
              <input
                type="text"
                value={form[key]}
                onChange={set(key)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Date
            </label>
            <input
              type="date"
              value={form.date}
              onChange={set("date")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Category
            </label>
            <select
              value={form.category}
              onChange={set("category")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {Object.keys(CATEGORY_COLORS).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={set("description")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(event.id, form)}
            className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-bold text-white hover:bg-sky-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({ event, onEdit, onDelete, onToggleFeatured }) {
  const catClass = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.other;

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {event.image ? (
            <img
              src={event.image}
              alt=""
              className="h-10 w-14 rounded-lg object-cover flex-shrink-0 bg-slate-100"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className="h-10 w-14 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-400 text-xs">
              No img
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm leading-tight truncate max-w-xs">
              {event.title}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
              {event.source_url ? (
                <a
                  href={event.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline hover:text-sky-600"
                >
                  View source ↗
                </a>
              ) : "No source URL"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${catClass}`}>
          {event.category || "other"}
        </span>
      </td>

      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(event.date)}</td>

      <td className="px-4 py-3 text-sm text-slate-600 max-w-[160px] truncate">
        {event.location || "—"}
      </td>

      <td className="px-4 py-3">
        <span className="text-xs text-slate-500 bg-slate-100 rounded px-2 py-0.5">
          {SOURCE_LABELS[event.source] || event.source || "—"}
        </span>
      </td>

      <td className="px-4 py-3 text-center">
        <button
          onClick={() => onToggleFeatured(event.id, !event.featured)}
          title={event.featured ? "Unfeature" : "Feature"}
          className={`text-lg ${event.featured ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
        >
          ★
        </button>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(event)}
            className="rounded-md bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(event.id, event.title)}
            className="rounded-md bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const qc = useQueryClient();
  const [editingEvent, setEditingEvent] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Queries
  const statsQuery = useQuery({
    queryKey: ["events-stats"],
    queryFn: getEventsStats,
  });

  const eventsQuery = useQuery({
    queryKey: ["admin-events", categoryFilter],
    queryFn: () =>
      getAdminEvents({
        category: categoryFilter === "all" ? undefined : categoryFilter,
        limit: 200,
      }),
  });

  const events = eventsQuery.data?.events ?? [];
  const total = statsQuery.data?.total ?? events.length;

  // Pagination (client-side on filtered list)
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pagedEvents = events.slice(pageStart, pageEnd);
  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));

  // Mutations
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => updateAdminEvent(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-events"] });
      setEditingEvent(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAdminEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-events"] }),
  });

  const featuredMutation = useMutation({
    mutationFn: ({ id, featured }) => setEventFeatured(id, featured),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-events"] }),
  });

  // Handlers
  const handleDelete = (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    deleteMutation.mutate(id);
  };

  const handleSave = (id, updates) => updateMutation.mutate({ id, updates });

  const handleToggleFeatured = (id, featured) => featuredMutation.mutate({ id, featured });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Events</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Scraped Ethiopian events — {total.toLocaleString()} total
          </p>
        </div>

        {/* Stats cards */}
        <div className="flex gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
            <p className="text-2xl font-bold text-sky-600">
              {statsQuery.isLoading ? "…" : total.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500">Total Events</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
            <p className="text-2xl font-bold text-amber-500">
              {events.filter((e) => e.featured).length}
            </p>
            <p className="text-xs text-slate-500">Featured</p>
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {["all", ...Object.keys(CATEGORY_COLORS)].map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategoryFilter(cat); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors border ${
              categoryFilter === cat
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700"
            }`}
          >
            {cat === "all" ? "All categories" : cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {eventsQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
            <span className="ml-3 text-slate-500">Loading events…</span>
          </div>
        ) : eventsQuery.isError ? (
          <div className="py-16 text-center text-red-500">
            {eventsQuery.error?.message || "Failed to load events"}
          </div>
        ) : pagedEvents.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <p className="text-4xl mb-2">📅</p>
            <p className="font-semibold">No events yet</p>
            <p className="text-sm mt-1">Events appear here after the scraping cycle runs</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Event", "Category", "Date", "Location", "Source", "Featured", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onEdit={setEditingEvent}
                    onDelete={handleDelete}
                    onToggleFeatured={handleToggleFeatured}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {pageStart + 1}–{Math.min(pageEnd, events.length)} of {events.length}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="flex items-center px-3 text-sm text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingEvent && (
        <EditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
