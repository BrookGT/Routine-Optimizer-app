import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const AuthContext = createContext(null);

export function useAuthContext() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => window.localStorage.getItem("adminToken") || "");
  const [email, setEmailState] = useState(() => window.localStorage.getItem("adminEmail") || "");

  const setToken = (value, nextEmail) => {
    const nextToken = (value || "").trim();
    if (nextToken) {
      window.localStorage.setItem("adminToken", nextToken);
    } else {
      window.localStorage.removeItem("adminToken");
    }
    setTokenState(nextToken);

    if (nextEmail !== undefined) {
      const cleanEmail = (nextEmail || "").trim();
      if (cleanEmail) {
        window.localStorage.setItem("adminEmail", cleanEmail);
      } else {
        window.localStorage.removeItem("adminEmail");
      }
      setEmailState(cleanEmail);
    }
  };

  const clearToken = () => {
    window.localStorage.removeItem("adminToken");
    window.localStorage.removeItem("adminEmail");
    setTokenState("");
    setEmailState("");
  };

  const value = useMemo(
    () => ({
      token,
      email,
      isAuthenticated: Boolean(token),
      setToken,
      clearToken,
    }),
    [token, email]
  );

  useEffect(() => {
    const handleLogout = () => clearToken();
    window.addEventListener("admin:logout", handleLogout);
    return () => window.removeEventListener("admin:logout", handleLogout);
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
