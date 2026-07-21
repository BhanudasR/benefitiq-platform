import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import { api, getToken, Principal } from "./api";

type AuthState = {
  principal: Principal | null;
  isAuthenticated: boolean;
  hasRole: (r: "analyst" | "reviewer" | "admin") => boolean;
  hasCapability: (cap: string) => boolean;
  login: (u: string, tenant: string, role?: string) => Promise<void>;
  logout: () => void;
  setPrincipal: (p: Principal | null) => void;
};

const ORDER: Record<string, number> = { analyst: 1, reviewer: 2, admin: 3 };
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children, initial = null }:
  { children: React.ReactNode; initial?: Principal | null }) {
  const [principal, setPrincipal] = useState<Principal | null>(initial);

  const login = useCallback(async (u: string, tenant: string, role = "analyst") => {
    await api.login(u, tenant, role);
    const me = await api.me();
    setPrincipal(me);
  }, []);

  const logout = useCallback(() => { api.logout(); setPrincipal(null); }, []);

  const hasRole = useCallback((r: "analyst" | "reviewer" | "admin") =>
    !!principal && (ORDER[principal.role] || 0) >= ORDER[r], [principal]);

  // Capability check mirrors the backend: only real-login principals carry capabilities.
  // A legacy admin principal (role=admin, no capabilities) is treated as manage_users-capable.
  const hasCapability = useCallback((cap: string) => {
    if (!principal) return false;
    const caps = principal.capabilities;
    if (caps == null) return cap === "manage_users" ? principal.role === "admin" : false;
    return caps.includes(cap);
  }, [principal]);

  const value = useMemo<AuthState>(() => ({
    principal, isAuthenticated: !!principal && !!getToken(), hasRole, hasCapability, login, logout, setPrincipal,
  }), [principal, hasRole, hasCapability, login, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
