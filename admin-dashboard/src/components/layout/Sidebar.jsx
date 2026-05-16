import {
  Activity,
  BarChart3,
  Bell,
  Brain,
  CalendarDays,
  CalendarRange,
  FlaskConical,
  MapPin,
  MessageSquareText,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";

const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "System Health", icon: Activity },
      { to: "/analytics",  label: "Analytics",     icon: BarChart3 },
    ],
  },
  {
    label: "User Data",
    items: [
      { to: "/users",           label: "Users",           icon: Users },
      { to: "/interactions",    label: "Interactions",    icon: MessageSquareText },
      { to: "/recommendations", label: "Recommendations", icon: Sparkles },
    ],
  },
  {
    label: "AI & ML",
    items: [
      { to: "/ai-model",    label: "AI Monitor",  icon: Brain },
      { to: "/experiments", label: "Experiments", icon: FlaskConical },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/places",     label: "Places",     icon: MapPin },
      { to: "/events",     label: "Events",     icon: CalendarRange },
      { to: "/routines",   label: "Routines",   icon: CalendarDays },
      { to: "/moderation", label: "Moderation", icon: Shield },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/system",        label: "System",        icon: Settings },
      { to: "/dev-tools",     label: "Dev Tools",     icon: Wrench },
    ],
  },
];

function NavItem({ item, onClick }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-white/10 text-white shadow-sm"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Icon pill */}
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
              isActive
                ? "bg-gradient-to-br from-indigo-500 to-violet-500 shadow-sm shadow-indigo-500/30"
                : "bg-white/5 group-hover:bg-white/10"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200")} />
          </span>
          <span className="truncate">{item.label}</span>
          {isActive && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ onNavigate, showClose = false }) {
  return (
    <aside
      className="flex h-full w-64 flex-col overflow-hidden"
      style={{ background: "linear-gradient(165deg, #0f0f1a 0%, #131325 60%, #0c0c18 100%)" }}
    >
      {/* Logo */}
      <div className="flex shrink-0 items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <Zap className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-400">Wuloye</p>
            <p className="text-sm font-bold text-white leading-none">Admin Console</p>
          </div>
        </div>
        {showClose && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-5 mb-3 h-px bg-white/[0.06]" />

      {/* Nav */}
      <nav className="sidebar-scroll flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.to} item={item} onClick={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-5 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="dot-live" />
          <span className="text-xs text-slate-500">Live monitoring active</span>
        </div>
      </div>
    </aside>
  );
}
