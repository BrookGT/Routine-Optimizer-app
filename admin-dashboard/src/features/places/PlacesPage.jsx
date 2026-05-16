import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminPlace,
  deleteAdminPlace,
  getAdminPlaces,
  getAdminPlacesMeta,
  updateAdminPlace,
} from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { cn } from "@/utils/cn";

const EMPTY_FORM = {
  name: "",
  type: "coffee",
  priceRange: "medium",
  location: { lat: "", lng: "", city: "" },
  tags: "",
  rating: "",
  isIndoor: true,
  popularityScore: "",
  description: "",
};

function PlaceForm({ place, types, priceRanges, onSave, onCancel, isLoading }) {
  const [form, setForm] = useState(
    place
      ? {
          ...place,
          tags: Array.isArray(place.tags) ? place.tags.join(", ") : "",
          location: place.location ?? { lat: "", lng: "", city: "" },
        }
      : EMPTY_FORM
  );

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const setLoc = (key) => (e) =>
    setForm((f) => ({ ...f, location: { ...f.location, [key]: e.target.value } }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...form,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      rating: parseFloat(form.rating) || undefined,
      popularityScore: parseFloat(form.popularityScore) || undefined,
      location: {
        lat: parseFloat(form.location.lat) || undefined,
        lng: parseFloat(form.location.lng) || undefined,
        city: form.location.city || undefined,
      },
    };
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Name *</label>
          <input required className="input-field" value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Type *</label>
          <select className="input-field" value={form.type} onChange={set("type")}>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Price Range *</label>
          <select className="input-field" value={form.priceRange} onChange={set("priceRange")}>
            {priceRanges.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Rating (1-5) *</label>
          <input required type="number" step="0.1" min="1" max="5" className="input-field" value={form.rating} onChange={set("rating")} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">City</label>
          <input className="input-field" value={form.location.city} onChange={setLoc("city")} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Popularity Score</label>
          <input type="number" step="0.01" className="input-field" value={form.popularityScore} onChange={set("popularityScore")} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Latitude</label>
          <input type="number" step="any" className="input-field" value={form.location.lat} onChange={setLoc("lat")} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Longitude</label>
          <input type="number" step="any" className="input-field" value={form.location.lng} onChange={setLoc("lng")} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tags (comma separated)</label>
        <input className="input-field" placeholder="wifi, quiet, parking..." value={form.tags} onChange={set("tags")} />
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="isIndoor" checked={form.isIndoor} onChange={set("isIndoor")} />
        <label htmlFor="isIndoor" className="text-sm text-slate-600">Indoor venue</label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save Place"}</Button>
      </div>
    </form>
  );
}

const PRICE_COLORS = {
  free: "bg-emerald-100 text-emerald-700",
  low: "bg-sky-100 text-sky-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};

export default function PlacesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modal, setModal] = useState(null); // null | { mode: 'create'|'edit', place?: {} }
  const [confirmDelete, setConfirmDelete] = useState(null);

  const placesQuery = useQuery({
    queryKey: ["admin-places"],
    queryFn: getAdminPlaces,
  });

  const metaQuery = useQuery({
    queryKey: ["admin-places-meta"],
    queryFn: getAdminPlacesMeta,
  });

  const createMutation = useMutation({
    mutationFn: createAdminPlace,
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-places"]);
      setModal(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAdminPlace(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-places"]);
      setModal(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminPlace,
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-places"]);
      setConfirmDelete(null);
    },
  });

  const places = placesQuery.data?.data ?? [];
  const types = metaQuery.data?.data?.types ?? [];
  const priceRanges = metaQuery.data?.data?.priceRanges ?? [];

  const filtered = places.filter((p) => {
    const matchSearch =
      !search.trim() ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.type?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || p.type === typeFilter;
    return matchSearch && matchType;
  });

  const mutationError =
    createMutation.error?.message || updateMutation.error?.message || deleteMutation.error?.message;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Place Management</h2>
          <p className="text-sm text-slate-500">
            {places.length > 0 ? `${places.length} places in catalogue` : "Manage recommendation places"}
          </p>
        </div>
        <Button onClick={() => setModal({ mode: "create" })}>+ Add Place</Button>
      </div>

      {mutationError && <Alert variant="error">{mutationError}</Alert>}

      <div className="flex flex-wrap gap-3">
        <input
          className="h-10 flex-1 min-w-[200px] rounded-lg border border-slate-200 px-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder="Search places..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {placesQuery.isLoading && <LoadingState label="Loading places..." />}
      {placesQuery.isError && <Alert variant="error">{placesQuery.error?.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && !placesQuery.isLoading && (
          <p className="col-span-full text-center text-slate-400 py-8">No places found.</p>
        )}
        {filtered.map((place) => (
          <Card key={place.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{place.name}</CardTitle>
                  <p className="text-xs text-slate-500 capitalize mt-0.5">{place.type}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                    PRICE_COLORS[place.priceRange] ?? "bg-slate-100 text-slate-600"
                  )}
                >
                  {place.priceRange}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Rating</span>
                <span className="font-semibold text-slate-900">★ {place.rating ?? "--"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Location</span>
                <span className="text-slate-500">{place.location?.city ?? "--"}</span>
              </div>
              {Array.isArray(place.tags) && place.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {place.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  className="h-7 flex-1 text-xs"
                  onClick={() => setModal({ mode: "edit", place })}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="h-7 flex-1 text-xs text-rose-600 hover:bg-rose-50"
                  onClick={() => setConfirmDelete(place)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl my-8">
            <h2 className="mb-4 text-lg font-bold text-slate-800">
              {modal.mode === "create" ? "Add New Place" : "Edit Place"}
            </h2>
            <PlaceForm
              place={modal.place}
              types={types.length ? types : ["coffee", "restaurant", "gym", "park", "social"]}
              priceRanges={priceRanges.length ? priceRanges : ["free", "low", "medium", "high"]}
              isLoading={createMutation.isPending || updateMutation.isPending}
              onCancel={() => setModal(null)}
              onSave={(data) => {
                if (modal.mode === "create") {
                  createMutation.mutate(data);
                } else {
                  updateMutation.mutate({ id: modal.place.id, data });
                }
              }}
            />
            {(createMutation.isError || updateMutation.isError) && (
              <Alert variant="error" className="mt-3">
                {createMutation.error?.message || updateMutation.error?.message}
              </Alert>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800">Delete Place?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Remove <strong>{confirmDelete.name}</strong> from the catalogue? This cannot be undone.
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
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
