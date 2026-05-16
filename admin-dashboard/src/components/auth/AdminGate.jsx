import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { signInWithEmailPassword, verifyAdminToken } from "@/services/auth";
import { Eye, EyeOff, Lock, Mail, Zap } from "lucide-react";

export default function AdminGate() {
  const { isAuthenticated, setToken } = useAuth();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]           = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail    = email.trim();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setError("Please fill in all fields.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(cleanEmail, cleanPassword);
      await verifyAdminToken(result.idToken);
      setToken(result.idToken, result.email);
      setPassword("");
    } catch (err) {
      setError(err.message || "Sign-in failed. Check your credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthenticated) return <Outlet />;

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#080812]">

      {/* Ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] rounded-full bg-purple-600/10 blur-[80px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex w-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-md fade-in">

          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/40">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-400">Wuloye</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Admin Console</h1>
              <p className="mt-1.5 text-sm text-slate-400">Sign in to access the control panel</p>
            </div>
          </div>

          {/* Card */}
          <div className="glass rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="admin@example.com"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPwd
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />
                    }
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-sm text-rose-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-700">!</span>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-violet-600 hover:shadow-xl hover:shadow-indigo-500/40 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-400">
              Admin access only. Your email must be listed in{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-600">ADMIN_EMAILS</code>.
            </p>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-slate-600">
            Wuloye Platform &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
