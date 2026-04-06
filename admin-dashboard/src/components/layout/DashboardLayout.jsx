import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/utils/cn";

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          isSidebarOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-slate-900/40 transition-opacity",
            isSidebarOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setIsSidebarOpen(false)}
          role="button"
          tabIndex={-1}
        />
        <div
          className={cn(
            "absolute left-0 top-0 h-full w-64 bg-white shadow-xl transition-transform",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar onNavigate={() => setIsSidebarOpen(false)} showClose />
        </div>
      </div>

      <div className="hidden md:fixed md:inset-y-0 md:z-30 md:block md:w-64">
        <Sidebar />
      </div>

      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        <Topbar onOpenSidebar={() => setIsSidebarOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
