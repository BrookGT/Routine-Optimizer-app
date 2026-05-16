import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, ChevronRight, RefreshCw, Users, UserX } from "lucide-react";
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
import { LoadingState, SkeletonRow } from "@/components/ui/loading";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils/cn";

function fmt(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function Section({ title, children }) {
  return (
    <div className="space-y-2.5">
      <p className="label-xs">{title}</p>
      {children}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className="text-xs font-medium text-text-primary text-right max-w-[60%] break-all">{value || "—"}</span>
    </div>
  );
}

function UserDetailPanel({ uid, onClose }) {
  const userQuery = useQuery({
    queryKey: ["admin-user-detail", uid],
    queryFn: () => getAdminUser(uid),
    enabled: Boolean(uid),
  });
  const user = userQuery.data?.data;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 h-full w-full max-w-[420px] overflow-y-auto"
        style={{ background: "var(--color-surface)", borderLeft: "1px solid var(--color-border)" }}
      >
        {/* Panel header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border-subtle)" }}
        >
          <h2 className="text-sm font-semibold text-text-primary">User Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay hover:text-text-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {userQuery.isLoading && <LoadingState label="Loading user…" />}
          {userQuery.isError && <Alert variant="error">{userQuery.error?.message}</Alert>}

          {user && (
            <>
              {/* Identity */}
              <Section title="Identity">
                <DetailRow label="UID"    value={user.uid} />
                <DetailRow label="Email"  value={user.email} />
                <DetailRow label="Name"   value={user.name} />
                <DetailRow label="Joined" value={fmt(user.createdAt)} />
                {user.suspended && (
                  <div className="mt-1">
                    <Badge variant="danger" dot>Suspended</Badge>
                  </div>
                )}
              </Section>

              {/* Preferences */}
              <Section title="Onboarding Preferences">
                <DetailRow label="Budget"          value={user.budgetRange} />
                <DetailRow label="Location"        value={user.locationPreference} />
                <DetailRow label="Religion"        value={user.religion} />
                <DetailRow label="Weekend pref."   value={user.weekendPreference} />
                <DetailRow label="Weekly budget"   value={user.weeklyBudget} />
              </Section>

              {/* Interests */}
              {Array.isArray(user.interests) && user.interests.length > 0 && (
                <Section title="Interests">
                  <div className="flex flex-wrap gap-1.5">
                    {user.interests.map((i) => (
                      <Badge key={i} variant="default">{i}</Badge>
                    ))}
                  </div>
                </Section>
              )}

              {/* Type affinity */}
              {user.typeAffinity && Object.keys(user.typeAffinity).length > 0 && (
                <Section title="Type Affinity">
                  <div className="space-y-2">
                    {Object.entries(user.typeAffinity)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([type, score]) => {
                        const max = Math.max(...Object.values(user.typeAffinity));
                        return (
                          <div key={type} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="capitalize text-text-secondary">{type}</span>
                              <span className="font-medium text-text-primary tabular-nums">{Number(score).toFixed(1)}</span>
                            </div>
                            <Progress value={(score / max) * 100} />
                          </div>
                        );
                      })}
                  </div>
                </Section>
              )}

              {/* Seen places */}
              {Array.isArray(user.seenPlaces) && user.seenPlaces.length > 0 && (
                <Section title={`Seen Places (${user.seenPlaces.length})`}>
                  <div className="flex flex-wrap gap-1">
                    {user.seenPlaces.slice(0, 12).map((id) => (
                      <span
                        key={id}
                        className="rounded bg-surface-inset px-2 py-0.5 font-mono text-[10px] text-text-secondary"
                      >
                        {id}
                      </span>
                    ))}
                    {user.seenPlaces.length > 12 && (
                      <span className="text-xs text-text-tertiary">+{user.seenPlaces.length - 12} more</span>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ConfirmModal({ user, onConfirm, onCancel, isPending }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-sm rounded-xl p-6 space-y-4 animate-fade-in"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-overlay)" }}
      >
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-text-primary">Delete account?</h3>
          <p className="text-sm text-text-secondary">
            This permanently deletes{" "}
            <span className="font-medium text-text-primary">{user.email ?? user.uid}</span>{" "}
            from Firestore. This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-2.5 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient  = useQueryClient();
  const [search,     setSearch]     = useState("");
  const [selectedUid,setSelectedUid]= useState(null);
  const [cursor,     setCursor]     = useState(null);
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

  const users   = usersQuery.data?.users ?? [];
  const total   = usersQuery.data?.total ?? 0;
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
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Users</h2>
          <p className="page-sub">
            {total > 0 ? `${total.toLocaleString()} total users` : "Manage platform user accounts"}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => queryClient.invalidateQueries(["admin-users"])}
          disabled={usersQuery.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${usersQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
        <input
          className="input-base pl-9"
          placeholder="Search by email, name, or UID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Errors */}
      {usersQuery.isError && <Alert variant="error">{usersQuery.error?.message}</Alert>}
      {suspendMutation.isError && <Alert variant="error">{suspendMutation.error?.message}</Alert>}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                {["Email / UID", "Name", "Budget", "Joined", "Status", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left"
                    style={{ background: "var(--color-surface-overlay)" }}
                  >
                    <span className="label-xs">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-text-tertiary">
                        <Users className="h-8 w-8 opacity-40" />
                        <p className="text-sm">{search ? "No users match your search" : "No users found"}</p>
                      </div>
                    </td>
                  </tr>
                )
                : filtered.map((user) => (
                  <tr
                    key={user.uid}
                    className="table-row-hover"
                    style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                  >
                    <td className="px-4 py-3">
                      <button
                        className="text-left hover:underline text-xs font-medium text-text-primary"
                        onClick={() => setSelectedUid(user.uid)}
                      >
                        {user.email ?? user.uid}
                      </button>
                      {user.email && (
                        <p className="text-[10px] text-text-tertiary font-mono mt-0.5 truncate max-w-[200px]">{user.uid}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{user.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary capitalize">{user.budgetRange ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-tertiary">{fmt(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={user.suspended ? "danger" : "success"} dot>
                        {user.suspended ? "Suspended" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="View details"
                          onClick={() => setSelectedUid(user.uid)}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className={user.suspended ? "text-positive hover:bg-[#f0fdf4]" : "text-warn hover:bg-[#fffbeb]"}
                          onClick={() => suspendMutation.mutate({ uid: user.uid, suspended: !user.suspended })}
                          disabled={suspendMutation.isPending}
                        >
                          {user.suspended ? "Unsuspend" : "Suspend"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-negative hover:bg-[#fef2f2]"
                          onClick={() => setConfirmDelete(user)}
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

        {hasMore && (
          <div
            className="flex justify-center px-4 py-3"
            style={{ borderTop: "1px solid var(--color-border-subtle)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const last = users[users.length - 1];
                if (last) setCursor(last.uid);
              }}
            >
              Load more users
            </Button>
          </div>
        )}
      </Card>

      {selectedUid && (
        <UserDetailPanel uid={selectedUid} onClose={() => setSelectedUid(null)} />
      )}

      {confirmDelete && (
        <ConfirmModal
          user={confirmDelete}
          onConfirm={() => deleteMutation.mutate(confirmDelete.uid)}
          onCancel={() => setConfirmDelete(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
