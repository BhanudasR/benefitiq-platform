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

export type Principal = { sub: string; tenant_id: string; role: string };

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
  logout() { setToken(null); },
};
