import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/utils/cn";

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f8fc]">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-out md:hidden",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar onNavigate={() => setIsSidebarOpen(false)} showClose />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 md:block">
        <Sidebar />
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onOpenSidebar={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-7">
            <div className="slide-up">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
