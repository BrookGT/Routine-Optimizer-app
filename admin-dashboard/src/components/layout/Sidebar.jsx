import {
  Activity,
  Brain,
  CalendarDays,
  FlaskConical,
  Heart,
  MessageSquareText,
  Sparkles,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/utils/cn";

const navGroups = [
  {
    label: "Monitor",
    items: [
      { to: "/dashboard", label: "Health", icon: Activity },
      { to: "/users", label: "Users", icon: Users },
      { to: "/interactions", label: "Interactions", icon: MessageSquareText },
      { to: "/recommendations", label: "Recommendations", icon: Sparkles },
    ],
  },
  {
    label: "AI & ML",
    items: [
      { to: "/ai-model", label: "AI Model", icon: Brain },
      { to: "/experiments", label: "Experiments", icon: FlaskConical },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/routines", label: "Routines", icon: CalendarDays },
      { to: "/dev-tools", label: "Dev Tools", icon: Wrench },
    ],
  },
];

export default function Sidebar({ onNavigate, showClose = false }) {
  return (
    <aside className="flex h-full w-64 flex-col bg-slate-950 px-4 py-6 text-slate-200">
      <div className="mb-6 flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-sky-400" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Wuloye</p>
            <h1 className="text-lg font-semibold text-white">Admin Console</h1>
          </div>
        </div>
        {showClose && (
          <button
            type="button"
            className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:bg-slate-900"
            onClick={onNavigate}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto pb-6 pr-1">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-slate-800 text-white"
                          : "text-slate-300 hover:bg-slate-900 hover:text-white"
                      )
                    }
                    onClick={onNavigate}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                          )}
                        />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
