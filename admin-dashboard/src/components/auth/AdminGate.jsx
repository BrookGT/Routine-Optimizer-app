import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { signInWithEmailPassword, verifyAdminToken } from "@/services/auth";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

export default function AdminGate() {
  const { isAuthenticated, setToken } = useAuth();
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPwd,     setShowPwd]     = useState(false);
  const [isSubmitting,setIsSubmitting]= useState(false);
  const [error,       setError]       = useState("");

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
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "#0e0e0c" }}
    >
      {/* Subtle texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Warm ambient glow — very subtle */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(120, 90, 60, 0.08) 0%, transparent 70%)",
        }}
      />

      {/* Login card */}
      <div
        className="relative z-10 w-full max-w-[380px] animate-fade-in"
      >
        {/* Brand mark */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white"
            style={{ background: "#292524", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            W
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white tracking-tight">Wuloye Admin</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
              Sign in to access the control panel
            </p>
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl p-7 space-y-4"
          style={{
            background: "#1a1a18",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[11px] font-medium uppercase tracking-[0.08em]"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="admin@example.com"
                  className="h-9 w-full rounded-lg pl-9 pr-3 text-sm outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.9)",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.25)"; e.target.style.background = "rgba(255,255,255,0.08)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.06)"; }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[11px] font-medium uppercase tracking-[0.08em]"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                />
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="••••••••"
                  className="h-9 w-full rounded-lg pl-9 pr-10 text-sm outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.9)",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.25)"; e.target.style.background = "rgba(255,255,255,0.08)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.06)"; }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-100"
                  style={{ color: "rgba(255,255,255,0.4)", opacity: 0.7 }}
                >
                  {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-xs"
                style={{
                  background: "rgba(220, 38, 38, 0.12)",
                  border: "1px solid rgba(220, 38, 38, 0.25)",
                  color: "#fca5a5",
                }}
              >
                <span className="mt-0.5 shrink-0">!</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-all active:scale-[0.99] disabled:opacity-50"
              style={{ background: "#292524", border: "1px solid rgba(255,255,255,0.12)" }}
              onMouseEnter={(e) => { e.target.style.background = "#3c3330"; }}
              onMouseLeave={(e) => { e.target.style.background = "#292524"; }}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
          Access restricted to authorized staff only
        </p>
      </div>
    </div>
  );
}
