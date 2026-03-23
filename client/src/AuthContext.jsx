import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, registerUser } from "./api.js";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function loadToken() {
  try {
    return window.localStorage.getItem("token");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => (typeof window !== "undefined" ? loadToken() : null));
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authErr, setAuthErr] = useState(null);

  useEffect(() => {
    setAuthErr(null);
    // If token exists but user is not loaded yet, we still keep the app usable.
    // The API will verify the token, and protected routes will work.
  }, [token]);

  const persist = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    try {
      window.localStorage.setItem("token", nextToken);
    } catch {
      // ignore
    }
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      setAuthLoading(true);
      setAuthErr(null);
      try {
        const data = await loginUser({ email, password });
        persist(data.token, data.user);
        navigate("/", { replace: true });
      } catch (e) {
        setAuthErr(e.message || String(e));
        throw e;
      } finally {
        setAuthLoading(false);
      }
    },
    [navigate, persist]
  );

  const register = useCallback(
    async ({ email, password }) => {
      setAuthLoading(true);
      setAuthErr(null);
      try {
        const data = await registerUser({ email, password });
        persist(data.token, data.user);
        navigate("/", { replace: true });
      } catch (e) {
        setAuthErr(e.message || String(e));
        throw e;
      } finally {
        setAuthLoading(false);
      }
    },
    [navigate, persist]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAuthErr(null);
    try {
      window.localStorage.removeItem("token");
    } catch {
      // ignore
    }
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      token,
      user,
      authLoading,
      authErr,
      login,
      register,
      logout,
    }),
    [token, user, authLoading, authErr, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

