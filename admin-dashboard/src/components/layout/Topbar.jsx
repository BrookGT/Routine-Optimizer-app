import { LogOut, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/utils/cn";

const PAGE_TITLES = {
  "/dashboard":      "System Health",
  "/analytics":      "Analytics",
  "/users":          "Users",
  "/interactions":   "Interactions",
  "/recommendations":"Recommendations",
  "/ai-model":       "AI Monitor",
  "/experiments":    "Experiments",
  "/places":         "Places",
  "/events":         "Events",
  "/routines":       "Routines",
  "/moderation":     "Moderation",
  "/notifications":  "Notifications",
  "/system":         "System Settings",
  "/dev-tools":      "Dev Tools",
};

const PAGE_SUBS = {
  "/dashboard":      "Real-time API status and performance",
  "/analytics":      "Platform usage and user insights",
  "/users":          "Manage and review user accounts",
  "/interactions":   "User-AI interaction logs",
  "/recommendations":"Recommendation engine data",
  "/ai-model":       "AI model status and controls",
  "/experiments":    "A/B tests and feature flags",
  "/places":         "Places catalogue management",
  "/events":         "Scraped and approved events",
  "/routines":       "User routine data",
  "/moderation":     "Content review queue",
  "/notifications":  "System-wide notifications",
  "/system":         "Platform configuration",
  "/dev-tools":      "Developer utilities",
};

export default function Topbar({ onOpenSidebar }) {
  const { isAuthenticated, clearToken, email: adminEmail } = useAuth();
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? "Dashboard";
  const sub   = PAGE_SUBS[location.pathname];
  const initials = adminEmail ? adminEmail.slice(0, 2).toUpperCase() : "AD";

  return (
    <header
      className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-4 px-5"
      style={{
        background: "rgba(250, 250, 248, 0.92)",
        borderBottom: "1px solid var(--color-border-subtle)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* Mobile menu button */}
      <button
        type="button"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary",
          "hover:bg-surface-overlay hover:text-text-secondary transition-colors md:hidden"
        )}
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-text-primary leading-none">{title}</h1>
          {sub && (
            <>
              <span className="text-border-strong text-sm">/</span>
              <span className="text-xs text-text-tertiary truncate hidden sm:block">{sub}</span>
            </>
          )}
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {isAuthenticated && (
          <>
            {/* Avatar */}
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white select-none"
              style={{ background: "#292524" }}
              title={adminEmail}
            >
              {initials}
            </div>

            {adminEmail && (
              <span className="hidden text-xs text-text-tertiary lg:block max-w-[160px] truncate">
                {adminEmail}
              </span>
            )}

            <div className="h-4 w-px bg-border mx-1" />

            <button
              type="button"
              onClick={clearToken}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium",
                "text-text-secondary border border-border",
                "hover:bg-[#fef2f2] hover:text-negative hover:border-[#fecaca] transition-colors"
              )}
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
