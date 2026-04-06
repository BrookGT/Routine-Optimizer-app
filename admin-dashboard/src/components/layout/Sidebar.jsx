import { BarChart3, FlaskConical, MessageSquareText, ServerCog, Sparkles, Users, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/utils/cn";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/users", label: "Users", icon: Users },
  { to: "/interactions", label: "Interactions", icon: MessageSquareText },
  { to: "/recommendations", label: "Recommendations", icon: Sparkles },
  { to: "/system", label: "System", icon: ServerCog },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
];

export default function Sidebar({ onNavigate, showClose = false }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Wuloye</p>
          <h1 className="text-lg font-semibold text-slate-900">Admin Console</h1>
        </div>
        {showClose && (
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
            onClick={onNavigate}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )
              }
              onClick={onNavigate}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
