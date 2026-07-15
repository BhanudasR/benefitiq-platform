import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { TABS, TAB_GROUPS } from "../nav/tabs";
import { useAuth } from "../lib/auth";

export function Shell() {
  const { principal, logout } = useAuth();
  return (
    <div className="min-h-screen bg-canvas text-ink flex">
      <aside className="w-64 shrink-0 bg-card border-r border-line px-3 py-4 overflow-y-auto" data-testid="sidebar">
        <div className="px-2 mb-4">
          <div className="text-lg font-semibold tracking-tight">BenefitIQ</div>
          <div className="text-[11px] text-muted">Decision Intelligence</div>
        </div>
        <nav aria-label="Primary">
          {TAB_GROUPS.map((g) => (
            <div key={g} className="mb-3">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">{g}</div>
              {TABS.filter((t) => t.group === g).map((t) => (
                <NavLink key={t.id} to={t.path} data-testid={`nav-${t.id}`}
                  className={({ isActive }) =>
                    `block px-2 py-1.5 rounded-lg text-sm mb-0.5 ${isActive
                      ? "bg-brandSoft text-brand font-medium" : "text-ink/80 hover:bg-slate-50"}`}>
                  {t.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-card border-b border-line flex items-center justify-between px-6">
          <div className="text-sm text-muted">Broker &amp; CXO advisory workspace</div>
          <div className="flex items-center gap-3 text-sm">
            {principal && <span className="text-muted">{principal.tenant_id} · {principal.role}</span>}
            <button onClick={logout} className="text-brand hover:underline">Sign out</button>
          </div>
        </header>
        <main className="p-6 max-w-[1200px] w-full mx-auto"><Outlet /></main>
      </div>
    </div>
  );
}
