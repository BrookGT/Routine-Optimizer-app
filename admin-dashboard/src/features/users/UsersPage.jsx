import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getInteractions, getUserProfile } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading";

const ACTION_VARIANTS = {
  view: "default",
  click: "default",
  save: "success",
  dismiss: "danger",
};

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getFriendlyError(error, activeSearch) {
  const raw = error?.message ?? "";
  const message = raw.toLowerCase();

  if (message.includes("unauthorized") || message.includes("authorization")) {
    if (activeSearch.type === "me") {
      return "You are not signed in. Add a Firebase ID token to continue, or search by UID/email in dev mode.";
    }
    return "This lookup requires a valid Firebase token. If you are in dev mode, search by UID/email instead.";
  }

  if (message.includes("user not found")) {
    return "No user matched that UID or email. Double-check the value and try again.";
  }

  if (message.includes("dev") && message.includes("only")) {
    return "This lookup is only available in development mode. Use a token-based request in production.";
  }

  return raw || "Unable to load user data right now.";
}

export default function UsersPage() {
  const [searchType, setSearchType] = useState("email");
  const [searchValue, setSearchValue] = useState("");
  const [activeSearch, setActiveSearch] = useState({ type: "me", value: "" });

  const activeParams = useMemo(() => {
    if (activeSearch.type === "me") return {};
    return { [activeSearch.type]: activeSearch.value };
  }, [activeSearch]);

  const profileQuery = useQuery({
    queryKey: ["user-profile", activeSearch.type, activeSearch.value],
    queryFn: () => getUserProfile(activeParams),
    enabled: activeSearch.type === "me" || Boolean(activeSearch.value),
  });

  const interactionsQuery = useQuery({
    queryKey: ["user-interactions", activeSearch.type, activeSearch.value],
    queryFn: () => getInteractions(activeParams),
    enabled: activeSearch.type === "me" || Boolean(activeSearch.value),
  });

  const profile = profileQuery.data?.data;
  const interests = profile?.interests ?? [];
  const seenPlaces = profile?.seenPlaces ?? [];
  const interactions = interactionsQuery.data?.data ?? [];

  const affinityEntries = useMemo(() => {
    const affinity = profile?.typeAffinity ?? {};
    return Object.entries(affinity)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .slice(0, 10);
  }, [profile]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setActiveSearch({ type: "me", value: "" });
      return;
    }
    setActiveSearch({ type: searchType, value: trimmed });
  };

  const handleClear = () => {
    setSearchValue("");
    setActiveSearch({ type: "me", value: "" });
  };

  const isLoading = profileQuery.isLoading || interactionsQuery.isLoading;

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-slate-900">User Inspection</h3>
        <p className="text-sm text-slate-500">Search by UID or email to inspect profile intelligence.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search User</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
              value={searchType}
              onChange={(event) => setSearchType(event.target.value)}
            >
              <option value="email">Email</option>
              <option value="uid">UID</option>
            </select>
            <input
              className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
              placeholder={searchType === "email" ? "user@example.com" : "firebase-uid"}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
            <Button type="submit">Search</Button>
            <Button type="button" variant="secondary" onClick={handleClear}>
              View Current
            </Button>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Lookups by email/UID use dev-only endpoints. For production, add admin endpoints or use the
            user&apos;s token.
          </p>
        </CardContent>
      </Card>

      {isLoading && <LoadingState label="Loading user profile..." />}

      {(profileQuery.isError || interactionsQuery.isError) && (
        <Alert variant="error">
          {getFriendlyError(profileQuery.error || interactionsQuery.error, activeSearch)}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">UID</p>
              <p className="font-medium text-slate-900">{profile?.uid ?? "--"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Email</p>
              <p className="font-medium text-slate-900">{profile?.email ?? "--"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Name</p>
              <p className="font-medium text-slate-900">{profile?.name ?? "--"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Created</p>
              <p className="font-medium text-slate-900">{formatDate(profile?.createdAt)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Budget</p>
              <p className="font-medium text-slate-900">{profile?.budgetRange ?? "--"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Location</p>
              <p className="font-medium text-slate-900">{profile?.locationPreference ?? "--"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Interests</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {interests.length === 0 && <span className="text-slate-400">No interests</span>}
                {interests.map((interest) => (
                  <Badge key={interest} variant="default">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Type Affinity</CardTitle>
          </CardHeader>
          <CardContent>
            {affinityEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No affinity data yet.</p>
            ) : (
              <div className="space-y-2">
                {affinityEntries.map(([type, score]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{type}</span>
                    <span className="font-semibold text-slate-900">{Number(score).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seen Places</CardTitle>
        </CardHeader>
        <CardContent>
          {seenPlaces.length === 0 ? (
            <p className="text-sm text-slate-400">No places seen yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {seenPlaces.slice(0, 20).map((place) => (
                <Badge key={place} variant="default">
                  {place}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Interactions</CardTitle>
        </CardHeader>
        <CardContent>
          {interactions.length === 0 ? (
            <p className="text-sm text-slate-400">No interactions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4">Place</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2 pr-4">Score</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {interactions.slice(0, 15).map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4 text-slate-500">{formatDate(item.createdAt)}</td>
                      <td className="py-2 pr-4 font-medium text-slate-900">{item.placeId}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={ACTION_VARIANTS[item.actionType] || "default"}>
                          {item.actionType}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-semibold">{item.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
