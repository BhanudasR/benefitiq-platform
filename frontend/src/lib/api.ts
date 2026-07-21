/** Typed governed API client. Talks ONLY to the BenefitIQ backend; never computes
 *  official numbers. Every value rendered by the UI originates from these responses. */
const API_BASE: string =
  ((import.meta as any).env && (import.meta as any).env.VITE_API_BASE) || "http://localhost:8000";

const TOKEN_KEY = "biq_token";

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function req(path: string, init: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  const tok = getToken();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export type Principal = {
  sub: string; tenant_id: string; role: string;
  user_role?: string | null; capabilities?: string[] | null;
  broker_id?: string | null; client_ids?: string[] | null;
};

/** Build a query string from params (drops empty values). No business logic. */
function qs(params: Record<string, any>): string {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return q ? `?${q}` : "";
}

export const api = {
  base: API_BASE,
  async login(username: string, tenant_id: string, role = "analyst"): Promise<string> {
    const r = await req("/auth/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, tenant_id, role }),
    });
    setToken(r.access_token);
    return r.access_token;
  },
  me(): Promise<Principal> { return req("/auth/me"); },
  metric(name: string, params: Record<string, any> = {}): Promise<any> {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return req(`/metrics/${name}${q ? "?" + q : ""}`);
  },
  batch(id: string): Promise<any> { return req(`/batches/${id}`); },
  reviewQueue(id: string): Promise<any> { return req(`/batches/${id}/review-queue`); },
  // governed read-only simulation + terms (Sprint 4-6 backends); UI renders fields only
  simulation(name: string, params: Record<string, any> = {}): Promise<any> {
    return req(`/simulation/${name}${qs(params)}`);
  },
  terms(params: Record<string, any> = {}): Promise<any> {
    return req(`/terms${qs(params)}`);
  },
  // governed read-only recommendation engines (Sprint 10 backend); UI renders fields only
  recommendation(name: string, params: Record<string, any> = {}): Promise<any> {
    return req(`/recommendations/${name}${qs(params)}`);
  },
  // governed read-only wellness engines (Sprint 12 backend); UI renders fields only
  wellness(name: string, params: Record<string, any> = {}): Promise<any> {
    return req(`/wellness/${name}${qs(params)}`);
  },
  // governed read-only benefit benchmarking (Sprint 15 backend); design + T&C only, no claims
  benchmarking(name: string, params: Record<string, any> = {}): Promise<any> {
    return req(`/benchmarking/${name}${qs(params)}`);
  },
  // governed read-only Placement Intelligence (Sprint 18); composition layer that REUSES the
  // placement-trigger engine + benchmarking — no frontend math, no fabricated quotes
  placement(name: string, params: Record<string, any> = {}): Promise<any> {
    return req(`/placement/${name}${qs(params)}`);
  },
  // Sprint 17 — benchmark gap -> Renewal / Savings Sandbox linkage (one-way, governed).
  // Writes require the benchmark_action capability (enforced server-side); the UI mirrors it.
  benchmarkActions: {
    flagGap(featureId: string, params: Record<string, any>, selected_action: string): Promise<any> {
      return req(`/benchmarking/gaps/${featureId}/actions${qs(params)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_action }),
      });
    },
    list(params: Record<string, any> = {}): Promise<any> { return req(`/benchmarking/actions${qs(params)}`); },
    get(id: string): Promise<any> { return req(`/benchmarking/actions/${id}`); },
    sendToSandbox(id: string): Promise<any> { return req(`/benchmarking/actions/${id}/send-to-sandbox`, { method: "POST" }); },
    sandboxPreview(id: string): Promise<any> { return req(`/benchmarking/actions/${id}/sandbox-preview`); },
    patch(id: string, body: Record<string, any>): Promise<any> {
      return req(`/benchmarking/actions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
  },
  // real-user login (Sprint 14) — email + password against the admin-managed user store
  async loginUser(email: string, password: string): Promise<any> {
    const r = await req("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setToken(r.access_token);
    return r;
  },
  // admin user management (Sprint 14). Protected server-side; UI mirrors backend permissions.
  admin: {
    roles(): Promise<any> { return req("/admin/roles"); },
    listUsers(): Promise<any> { return req("/admin/users"); },
    getUser(id: string): Promise<any> { return req(`/admin/users/${id}`); },
    createUser(body: Record<string, any>): Promise<any> {
      return req("/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    updateUser(id: string, body: Record<string, any>): Promise<any> {
      return req(`/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    resetPassword(id: string): Promise<any> { return req(`/admin/users/${id}/reset-password`, { method: "POST" }); },
    deactivate(id: string): Promise<any> { return req(`/admin/users/${id}/deactivate`, { method: "POST" }); },
    activate(id: string): Promise<any> { return req(`/admin/users/${id}/activate`, { method: "POST" }); },
    setClients(id: string, client_ids: string[]): Promise<any> {
      return req(`/admin/users/${id}/clients`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_ids }) });
    },
  },
  logout() { setToken(null); },
};
