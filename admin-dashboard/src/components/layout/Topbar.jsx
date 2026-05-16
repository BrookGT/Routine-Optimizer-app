import { Bell, LogOut, Menu, Search } from "lucide-react";
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

export default function Topbar({ onOpenSidebar }) {
  const { isAuthenticated, clearToken, email: adminEmail } = useAuth();
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? "Dashboard";
  const initials = adminEmail
    ? adminEmail.slice(0, 2).toUpperCase()
    : "AD";

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white/90 px-6 backdrop-blur-md">
      {/* Mobile menu button */}
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition md:hidden"
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <div className="flex-1">
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {/* Bell */}
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 mx-1" />

        {/* Avatar + Sign out */}
        {isAuthenticated && (
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-sm shadow-indigo-200 select-none">
              {initials}
            </div>
            {adminEmail && (
              <span className="hidden text-xs font-medium text-slate-600 lg:block max-w-[160px] truncate">
                {adminEmail}
              </span>
            )}
            <button
              type="button"
              onClick={clearToken}
              className="flex items-center gap-1.5 rounded-lg px-3 h-8 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
