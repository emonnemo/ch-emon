"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getMe,
  getStoredToken,
  loginAccount,
  registerAccount,
  setStoredToken,
  updateUserPreferences,
  type User,
  type UserPreferences,
} from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  savePreferences: (prefs: UserPreferences) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    getMe()
      .then((me) => {
        if (active) setUser(me);
      })
      .catch(() => {
        setStoredToken(null);
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginAccount(email, password);
    setStoredToken(res.access_token);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await registerAccount(name, email, password);
      setStoredToken(res.access_token);
      setUser(res.user);
    },
    []
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  const savePreferences = useCallback(async (prefs: UserPreferences) => {
    try {
      const updated = await updateUserPreferences(prefs);
      setUser(updated);
    } catch {
      // ignore transient preference sync errors
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, savePreferences }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
