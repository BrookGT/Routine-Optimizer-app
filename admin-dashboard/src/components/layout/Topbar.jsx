import { Bell, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Topbar({ onOpenSidebar }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations</p>
            <h2 className="text-xl font-bold text-slate-900">Control Center</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 md:flex">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              className="w-40 bg-transparent text-sm text-slate-600 outline-none placeholder:text-slate-400"
              placeholder="Search"
              type="text"
            />
          </div>
          <Button variant="secondary" size="sm">
            <Bell className="mr-2 h-4 w-4" /> Alerts
          </Button>
        </div>
      </div>
    </header>
  );
}
