import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { LoginInput, RegisterAdminInput, SessionUser } from '@puente/shared';
import { api, getToken, setToken, clearToken } from './api';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterAdminInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  // Start "loading" only when there's a token to validate — otherwise there's nothing to wait
  // for, and initializing from the token avoids a synchronous setState in the effect.
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api.auth
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const res = await api.auth.login(input);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (input: RegisterAdminInput) => {
    const res = await api.auth.register(input);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated: Boolean(user), login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
