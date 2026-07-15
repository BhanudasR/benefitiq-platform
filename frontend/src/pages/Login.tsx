import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/primitives";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [u, setU] = useState("analyst");
  const [tenant, setTenant] = useState("acme");
  const [role, setRole] = useState("analyst");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try { await login(u, tenant, role); nav("/executive-summary"); }
    catch (e: any) { setErr(e.message || "Login failed"); }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <Card className="p-8 w-[380px]">
        <div className="text-xl font-semibold tracking-tight mb-1">BenefitIQ</div>
        <div className="text-sm text-muted mb-5">Sign in to the advisory workspace</div>
        <form onSubmit={submit} className="space-y-3">
          <input aria-label="Username" value={u} onChange={(e) => setU(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm" placeholder="username" />
          <input aria-label="Tenant" value={tenant} onChange={(e) => setTenant(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm" placeholder="tenant" />
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm">
            <option value="analyst">Analyst</option>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
          </select>
          {err && <div className="text-sm text-bad">{err}</div>}
          <button type="submit" className="w-full bg-brand text-white text-sm font-medium rounded-lg py-2">Sign in</button>
        </form>
      </Card>
    </div>
  );
}
