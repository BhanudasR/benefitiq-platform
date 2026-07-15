import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { setToken } from "../lib/api";

export function renderWithProviders(ui: React.ReactNode, { route = "/", principal = { sub: "u", tenant_id: "acme", role: "analyst" } as any } = {}) {
  // an authenticated session requires BOTH a principal and a stored token
  // (RequireAuth checks getToken()); seed one so guarded routes render.
  if (principal) setToken("test-jwt-token");
  else setToken(null);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initial={principal}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
