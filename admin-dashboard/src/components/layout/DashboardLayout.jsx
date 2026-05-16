import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/utils/cn";

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-250 ease-out md:hidden",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar onNavigate={() => setIsSidebarOpen(false)} showClose />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden shrink-0 md:flex md:flex-col" style={{ borderRight: "1px solid var(--color-canvas-border)" }}>
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <Topbar onOpenSidebar={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div
            key={location.pathname}
            className="mx-auto w-full max-w-[1280px] px-6 py-7 animate-fade-in"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
