import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, getToken, setToken } from "../lib/api";

describe("auth + governed API client", () => {
  beforeEach(() => { setToken(null); vi.restoreAllMocks(); });

  it("login stores the JWT and the client sends it as a Bearer token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "jwt-123" }) })   // /auth/token
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: "u", tenant_id: "acme", role: "reviewer" }) }); // /auth/me
    vi.stubGlobal("fetch", fetchMock);

    await api.login("u", "acme", "reviewer");
    expect(getToken()).toBe("jwt-123");

    const me = await api.me();
    expect(me.tenant_id).toBe("acme");
    // the /auth/me call carried the Authorization header
    const meCall = fetchMock.mock.calls[1];
    expect(meCall[1].headers["Authorization"]).toBe("Bearer jwt-123");
  });

  it("failed API responses raise a recoverable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "not found", statusText: "Not Found" }));
    await expect(api.batch("nope")).rejects.toThrow(/404/);
  });
});
