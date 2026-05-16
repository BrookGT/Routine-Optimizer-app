import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAdminUser,
  getAdminUser,
  getAdminUsers,
  suspendAdminUser,
} from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";
import { cn } from "@/utils/cn";

function formatDate(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function UserDetailPanel({ uid, onClose }) {
  const userQuery = useQuery({
    queryKey: ["admin-user-detail", uid],
    queryFn: () => getAdminUser(uid),
    enabled: Boolean(uid),
  });

  const user = userQuery.data?.data;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-slate-950/50">
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">User Details</h2>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        {userQuery.isLoading && <LoadingState label="Loading user..." />}
        {userQuery.isError && (
          <Alert variant="error">{userQuery.error?.message}</Alert>
        )}

        {user && (
          <div className="space-y-4 text-sm text-slate-700">
            <section className="rounded-xl border border-slate-100 p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Identity</h3>
              <p><span className="text-slate-400">UID:</span> <span className="font-mono text-xs">{user.uid}</span></p>
              <p><span className="text-slate-400">Email:</span> {user.email ?? "--"}</p>
              <p><span className="text-slate-400">Name:</span> {user.name ?? "--"}</p>
              <p><span className="text-slate-400">Joined:</span> {formatDate(user.createdAt)}</p>
              {user.suspended && <Badge variant="danger">Suspended</Badge>}
            </section>

            <section className="rounded-xl border border-slate-100 p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Onboarding Preferences</h3>
              <p><span className="text-slate-400">Budget:</span> {user.budgetRange ?? "--"}</p>
              <p><span className="text-slate-400">Location:</span> {user.locationPreference ?? "--"}</p>
              <p><span className="text-slate-400">Religion:</span> {user.religion ?? "--"}</p>
              <p><span className="text-slate-400">Weekend:</span> {user.weekendPreference ?? "--"}</p>
              <p><span className="text-slate-400">Weekly Budget:</span> {user.weeklyBudget ?? "--"}</p>
            </section>

            {Array.isArray(user.interests) && user.interests.length > 0 && (
              <section className="rounded-xl border border-slate-100 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Interests</h3>
                <div className="flex flex-wrap gap-2">
                  {user.interests.map((i) => <Badge key={i} variant="default">{i}</Badge>)}
                </div>
              </section>
            )}

            {user.typeAffinity && Object.keys(user.typeAffinity).length > 0 && (
              <section className="rounded-xl border border-slate-100 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Type Affinity</h3>
                <div className="space-y-1">
                  {Object.entries(user.typeAffinity)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([type, score]) => (
                      <div key={type} className="flex justify-between">
                        <span className="capitalize">{type}</span>
                        <span className="font-semibold text-slate-900">{Number(score).toFixed(1)}</span>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {Array.isArray(user.seenPlaces) && user.seenPlaces.length > 0 && (
              <section className="rounded-xl border border-slate-100 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Seen Places ({user.seenPlaces.length})
                </h3>
                <div className="flex flex-wrap gap-1">
                  {user.seenPlaces.slice(0, 15).map((id) => (
                    <span key={id} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">{id}</span>
                  ))}
                  {user.seenPlaces.length > 15 && (
                    <span className="text-xs text-slate-400">+{user.seenPlaces.length - 15} more</span>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users", cursor],
    queryFn: () => getAdminUsers({ limit: 50, startAfter: cursor }),
    keepPreviousData: true,
  });

  const suspendMutation = useMutation({
    mutationFn: ({ uid, suspended }) => suspendAdminUser(uid, suspended),
    onSuccess: () => queryClient.invalidateQueries(["admin-users"]),
  });

  const deleteMutation = useMutation({
    mutationFn: (uid) => deleteAdminUser(uid),
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-users"]);
      setConfirmDelete(null);
    },
  });

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const hasMore = usersQuery.data?.hasMore ?? false;

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email?.toLowerCase().includes(search.toLowerCase()) ||
          u.uid?.toLowerCase().includes(search.toLowerCase()) ||
          u.name?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="text-sm text-slate-500">
            {total > 0 ? `${total.toLocaleString()} total users` : "Manage all platform users"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => queryClient.invalidateQueries(["admin-users"])}>
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <input
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="Search by email, UID, or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {usersQuery.isLoading && <LoadingState label="Loading users..." />}
      {usersQuery.isError && (
        <Alert variant="error">{usersQuery.error?.message}</Alert>
      )}

      {suspendMutation.isError && (
        <Alert variant="error">{suspendMutation.error?.message}</Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Budget</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && !usersQuery.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No users found.
                    </td>
                  </tr>
                )}
                {filtered.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <button
                        className="text-sky-600 hover:underline text-left"
                        onClick={() => setSelectedUid(user.uid)}
                      >
                        {user.email ?? "--"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.name ?? "--"}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{user.budgetRange ?? "--"}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      {user.suspended ? (
                        <Badge variant="danger">Suspended</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelectedUid(user.uid)}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          className={cn(
                            "h-7 px-2 text-xs",
                            user.suspended ? "text-emerald-600" : "text-amber-600"
                          )}
                          onClick={() =>
                            suspendMutation.mutate({ uid: user.uid, suspended: !user.suspended })
                          }
                          disabled={suspendMutation.isPending}
                        >
                          {user.suspended ? "Unsuspend" : "Suspend"}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => setConfirmDelete(user)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="flex justify-center border-t border-slate-100 p-4">
              <Button
                variant="secondary"
                onClick={() => {
                  const last = users[users.length - 1];
                  if (last) setCursor(last.uid);
                }}
              >
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedUid && (
        <UserDetailPanel uid={selectedUid} onClose={() => setSelectedUid(null)} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800">Delete User?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This will permanently delete <strong>{confirmDelete.email ?? confirmDelete.uid}</strong> from
              Firestore. This cannot be undone.
            </p>
            <div className="mt-4 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-rose-600 hover:bg-rose-700"
                onClick={() => deleteMutation.mutate(confirmDelete.uid)}
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
