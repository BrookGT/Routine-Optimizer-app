import { Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminGate from "@/components/auth/AdminGate";
import DashboardPage from "@/features/dashboard/DashboardPage";
import UsersPage from "@/features/users/UsersPage";
import InteractionsPage from "@/features/interactions/InteractionsPage";
import RecommendationsPage from "@/features/recommendations/RecommendationsPage";
import ExperimentsPage from "@/features/experiments/ExperimentsPage";
import AiModelPage from "@/features/aiModel/AiModelPage";
import RoutinesPage from "@/features/routines/RoutinesPage";
import DevToolsPage from "@/features/devTools/DevToolsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AdminGate />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/interactions" element={<InteractionsPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/ai-model" element={<AiModelPage />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/routines" element={<RoutinesPage />} />
          <Route path="/dev-tools" element={<DevToolsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
