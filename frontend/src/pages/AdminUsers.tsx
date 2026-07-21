import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  SectionHeader, Card, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";

/** Settings › User Management (Sprint 14). Admin-only, enterprise-grade user administration.
 *  Renders from the governed /admin APIs; backend enforces access (this page is only reachable
 *  by users with the manage_users capability). No business logic in the browser. */

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-50 text-good border-green-200",
  inactive: "bg-slate-100 text-muted border-line",
};

function RoleBadge({ role }: { role: string }) {
  return <span data-testid="au-role-badge"
    className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-brandSoft text-brand border-blue-200">{role}</span>;
}
function StatusBadge({ status }: { status: string }) {
  return <span data-testid="au-status-badge"
    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[status] || STATUS_STYLE.inactive}`}>{status}</span>;
}

export function AdminUsers() {
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.admin.listUsers() });
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: () => api.admin.roles() });

  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tempReveal, setTempReveal] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ email: "", username: "", user_role: "analyst", display_name: "" });
  const [busy, setBusy] = useState(false);

  const roleList: any[] = roles.data?.roles || [];
  const list: any[] = users.data?.users || [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((u) => `${u.email} ${u.display_name || ""} ${u.user_role}`.toLowerCase().includes(s));
  }, [list, q]);

  async function run(fn: () => Promise<any>, ok: string, reveal = false) {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      if (reveal && r?.temporary_password) setTempReveal({ email: r.user?.email, password: r.temporary_password });
      setMsg({ kind: "ok", text: ok });
      await users.refetch();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message || "Action failed" });
    } finally { setBusy(false); }
  }

  if (users.isLoading) return <><SectionHeader title="User Management" subtitle="Admin — manage platform users & access" /><Skeleton rows={4} /></>;
  if (users.isError) return <><SectionHeader title="User Management" /><ErrorState onRetry={() => users.refetch()} /></>;

  return (
    <div className="space-y-5">
      <SectionHeader title="User Management" subtitle="Admin — create testers/colleagues, assign roles & client access, reset or deactivate" />

      {msg && (
        <div role="status" data-testid="au-message"
          className={`rounded-xl2 px-4 py-3 text-sm border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-good" : "bg-red-50 border-red-200 text-bad"}`}>{msg.text}</div>
      )}
      {tempReveal && (
        <Card className="p-4 border-l-4 border-l-amber-400">
          <div data-testid="au-temp-password" className="text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-warn mb-1">Temporary password (shown once)</div>
            <div>User <b>{tempReveal.email}</b> — temporary password: <code className="bg-slate-100 px-2 py-0.5 rounded">{tempReveal.password}</code></div>
            <div className="text-xs text-muted mt-1">Share securely. It is not stored in plain text and cannot be shown again.</div>
            <button className="mt-2 text-xs font-medium text-brand hover:underline" onClick={() => setTempReveal(null)}>Dismiss</button>
          </div>
        </Card>
      )}

      {/* Create user */}
      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Create user</div>
        <form data-testid="au-create-form" className="grid grid-cols-1 sm:grid-cols-5 gap-3"
          onSubmit={(e) => { e.preventDefault(); if (!form.email || !form.username) { setMsg({ kind: "err", text: "Email and username are required" }); return; }
            run(() => api.admin.createUser(form), "User created."); setForm({ email: "", username: "", user_role: "analyst", display_name: "" }); }}>
          <input aria-label="Email" placeholder="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            className="border border-line rounded-lg px-3 py-2 text-sm" />
          <input aria-label="Username" placeholder="username" value={form.username} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))}
            className="border border-line rounded-lg px-3 py-2 text-sm" />
          <input aria-label="Display name" placeholder="display name" value={form.display_name} onChange={(e) => setForm((s) => ({ ...s, display_name: e.target.value }))}
            className="border border-line rounded-lg px-3 py-2 text-sm" />
          <select aria-label="Role" data-testid="au-role-select" value={form.user_role} onChange={(e) => setForm((s) => ({ ...s, user_role: e.target.value }))}
            className="border border-line rounded-lg px-3 py-2 text-sm">
            {roleList.map((r) => <option key={r.user_role} value={r.user_role}>{r.label}</option>)}
          </select>
          <button type="submit" data-testid="au-create-btn" disabled={busy}
            className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-60">Create user</button>
        </form>
      </Card>

      {/* User table */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Users ({filtered.length})</div>
          <input aria-label="Search users" data-testid="au-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
            className="border border-line rounded-lg px-3 py-1.5 text-sm w-56" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No users yet" message="Create your first user above to start controlled testing access." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="au-table">
              <thead><tr className="text-left text-muted border-b border-line">
                <th className="py-1.5 pr-4 font-medium">User</th><th className="py-1.5 pr-4 font-medium">Role</th>
                <th className="py-1.5 pr-4 font-medium">Status</th><th className="py-1.5 pr-4 font-medium">Clients</th>
                <th className="py-1.5 pr-4 font-medium">Actions</th></tr></thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-line/60" data-testid="au-row">
                    <td className="py-2 pr-4"><div className="text-ink">{u.display_name || u.username}</div><div className="text-xs text-muted">{u.email}</div></td>
                    <td className="py-2 pr-4">
                      <select aria-label={`Role for ${u.email}`} value={u.user_role} disabled={busy}
                        onChange={(e) => run(() => api.admin.updateUser(u.id, { user_role: e.target.value }), "Role updated.")}
                        className="border border-line rounded-lg px-2 py-1 text-xs mr-2">
                        {roleList.map((r) => <option key={r.user_role} value={r.user_role}>{r.label}</option>)}
                      </select>
                      <RoleBadge role={u.user_role} />
                    </td>
                    <td className="py-2 pr-4"><StatusBadge status={u.status} /></td>
                    <td className="py-2 pr-4" data-testid="au-client-count">{u.assigned_client_count}</td>
                    <td className="py-2 pr-4">
                      <button data-testid="au-reset" disabled={busy} onClick={() => run(() => api.admin.resetPassword(u.id), "Password reset.", true)}
                        className="text-xs font-medium text-brand hover:underline mr-3">Reset password</button>
                      {u.status === "active" ? (
                        <button data-testid="au-deactivate" disabled={busy} onClick={() => run(() => api.admin.deactivate(u.id), "User deactivated.")}
                          className="text-xs font-medium text-bad hover:underline">Deactivate</button>
                      ) : (
                        <button data-testid="au-activate" disabled={busy} onClick={() => run(() => api.admin.activate(u.id), "User activated.")}
                          className="text-xs font-medium text-good hover:underline">Activate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
