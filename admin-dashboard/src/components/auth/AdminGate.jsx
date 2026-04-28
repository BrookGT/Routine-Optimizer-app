import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { signInWithEmailPassword, verifyAdminToken } from "@/services/auth";

export default function AdminGate() {
  const { isAuthenticated, setToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setError("Enter both email and password to continue.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(cleanEmail, cleanPassword);
      await verifyAdminToken(result.idToken);
      setToken(result.idToken, result.email);
      setPassword("");
    } catch (authError) {
      setError(
        authError.message ||
          "Unable to sign in. Ensure this account is in ADMIN_EMAILS or has admin claims."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthenticated) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin Access</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Sign in with an admin email and password.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
              placeholder="admin@example.com"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
            />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
            />
            <Button type="submit" className="w-full">
              {isSubmitting ? "Signing In..." : "Sign In"}
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <p className="mt-4 text-xs text-slate-400">
            Access is granted for tokens with admin claims or emails listed in
            the backend `ADMIN_EMAILS` setting.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
