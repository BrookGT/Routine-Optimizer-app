import { useAuthContext } from "@/context/AuthContext";

export function useAuth() {
  const context = useAuthContext();
  if (context) return context;

  const token = window.localStorage.getItem("adminToken") || "";
  const email = window.localStorage.getItem("adminEmail") || "";

  const setToken = (value, nextEmail) => {
    const nextToken = (value || "").trim();
    if (nextToken) {
      window.localStorage.setItem("adminToken", nextToken);
    } else {
      window.localStorage.removeItem("adminToken");
    }

    if (nextEmail !== undefined) {
      const cleanEmail = (nextEmail || "").trim();
      if (cleanEmail) {
        window.localStorage.setItem("adminEmail", cleanEmail);
      } else {
        window.localStorage.removeItem("adminEmail");
      }
    }
  };

  const clearToken = () => {
    window.localStorage.removeItem("adminToken");
    window.localStorage.removeItem("adminEmail");
  };

  return {
    token,
    email,
    isAuthenticated: Boolean(token),
    setToken,
    clearToken,
  };
}
