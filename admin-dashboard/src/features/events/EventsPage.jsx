import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search, Star, X } from "lucide-react";
import {
  deleteAdminEvent,
  getAdminEvents,
  getEventsStats,
  setEventFeatured,
  updateAdminEvent,
} from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState, SkeletonRow, SkeletonCard } from "@/components/ui/loading";
import { cn } from "@/utils/cn";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

const CATEGORIES = [
  "music", "tech", "church", "fitness", "business",
  "food", "art", "sports", "education", "social", "other",
];

const SOURCE_LABELS = {
  alladdisevents:           "AllAddis",
  whatsupaddis:             "WhatsUp",
  telegram_events_ethiopia: "Telegram",
};

/* ── Edit Modal ─────────────────────────────────────────────────────────── */
function EditModal({ event, onClose, onSave, isPending }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-xl p-6 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 16px 48px rgba(0,0,0,0.12)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Edit Event</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {[
            { label: "Title",      key: "title" },
            { label: "Location",   key: "location" },
            { label: "Image URL",  key: "image" },
            { label: "Source URL", key: "source_url" },
          ].map(({ label, key }) => (
            <div key={key} className="space-y-1">
              <label className="label-xs">{label}</label>
              <input type="text" value={form[key]} onChange={set(key)} className="input-base" />
            </div>
          ))}

          <div className="space-y-1">
            <label className="label-xs">Date</label>
            <input type="date" value={form.date} onChange={set("date")} className="input-base" />
          </div>

          <div className="space-y-1">
            <label className="label-xs">Category</label>
            <select value={form.category} onChange={set("category")} className="input-base">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="label-xs">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={set("description")}
              className="input-base"
              style={{ height: "auto", resize: "vertical" }}
            />
          </div>
        </div>

        <div className="flex gap-2.5 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="default" className="flex-1" onClick={() => onSave(event.id, form)} disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function EventsPage() {
  const qc = useQueryClient();
  const [editingEvent,    setEditingEvent]    = useState(null);
  const [categoryFilter,  setCategoryFilter]  = useState("all");
  const [search,          setSearch]          = useState("");
  const [page,            setPage]            = useState(1);
  const PAGE_SIZE = 20;

  const statsQuery = useQuery({ queryKey: ["events-stats"], queryFn: getEventsStats });
  const eventsQuery = useQuery({
    queryKey: ["admin-events", categoryFilter],
    queryFn: () => getAdminEvents({ category: categoryFilter === "all" ? undefined : categoryFilter, limit: 200 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => updateAdminEvent(id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-events"] }); setEditingEvent(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAdminEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-events"] }),
  });
  const featuredMutation = useMutation({
    mutationFn: ({ id, featured }) => setEventFeatured(id, featured),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-events"] }),
  });

  const allEvents = eventsQuery.data?.events ?? [];
  const total     = statsQuery.data?.total ?? allEvents.length;

  const filtered = allEvents.filter((e) =>
    !search || e.title?.toLowerCase().includes(search.toLowerCase()) || e.location?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart   = (page - 1) * PAGE_SIZE;
  const pagedEvents = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const handleDelete = (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Events</h2>
          <p className="page-sub">
            {total.toLocaleString()} scraped events · {allEvents.filter((e) => e.featured).length} featured
          </p>
        </div>
        <Button
          variant="secondary" size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-events"] })}
          disabled={eventsQuery.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${eventsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
          <input
            className="input-base pl-9 w-60"
            placeholder="Search events…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5">
          {["all", ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategoryFilter(cat); setPage(1); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                categoryFilter === cat
                  ? "bg-text-primary text-white border-text-primary"
                  : "bg-white text-text-secondary border-border hover:border-border-strong hover:text-text-primary"
              )}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      </div>

      {eventsQuery.isError && <Alert variant="error">{eventsQuery.error?.message}</Alert>}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                {["Event", "Category", "Date", "Location", "Source", "★", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left" style={{ background: "var(--color-surface-overlay)" }}>
                    <span className="label-xs">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventsQuery.isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                : pagedEvents.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-text-tertiary">
                        <CalendarDays className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No events found</p>
                      </div>
                    </td>
                  </tr>
                )
                : pagedEvents.map((event) => (
                  <tr
                    key={event.id}
                    className="table-row-hover"
                    style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {event.image ? (
                          <img
                            src={event.image}
                            alt=""
                            className="h-8 w-12 rounded-md object-cover shrink-0"
                            style={{ background: "var(--color-surface-overlay)" }}
                            onError={(e) => { e.target.style.display = "none"; }}
                          />
                        ) : (
                          <div
                            className="h-8 w-12 rounded-md shrink-0 flex items-center justify-center"
                            style={{ background: "var(--color-surface-inset)" }}
                          >
                            <CalendarDays className="h-3.5 w-3.5 text-text-tertiary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-primary truncate max-w-[220px]">{event.title}</p>
                          {event.source_url && (
                            <a
                              href={event.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-text-tertiary hover:text-text-secondary hover:underline transition-colors"
                            >
                              View source ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{event.category || "other"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{fmtDate(event.date)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary max-w-[140px] truncate">{event.location || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-text-tertiary bg-surface-overlay border border-border rounded px-1.5 py-0.5">
                        {SOURCE_LABELS[event.source] || event.source || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => featuredMutation.mutate({ id: event.id, featured: !event.featured })}
                        className={cn(
                          "transition-colors",
                          event.featured ? "text-warn" : "text-text-tertiary hover:text-warn"
                        )}
                        title={event.featured ? "Unfeature" : "Mark as featured"}
                      >
                        <Star className="h-3.5 w-3.5" fill={event.featured ? "currentColor" : "none"} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button variant="ghost" size="xs" onClick={() => setEditingEvent(event)}>Edit</Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-negative hover:bg-[#fef2f2]"
                          onClick={() => handleDelete(event.id, event.title)}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: "1px solid var(--color-border-subtle)" }}
          >
            <p className="text-xs text-text-tertiary">
              {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-text-secondary tabular-nums">{page} / {totalPages}</span>
              <Button variant="secondary" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {editingEvent && (
        <EditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={(id, updates) => updateMutation.mutate({ id, updates })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}
