import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  const noData = { data_quality_status: "No Data", value: { levers: [] } };
  return { ...actual, api: { ...actual.api,
    metric: vi.fn().mockResolvedValue(noData),
    admin: { listUsers: vi.fn(), roles: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(),
             resetPassword: vi.fn(), deactivate: vi.fn(), activate: vi.fn(), setClients: vi.fn() } } };
});
import { api } from "../lib/api";
import { Shell } from "../components/Shell";
import { AppRoutes } from "../routes";
import { AdminUsers } from "../pages/AdminUsers";
import { TABS } from "../nav/tabs";

const ADMIN = { sub: "admin@x.local", tenant_id: "acme", role: "admin",
  user_role: "platform_admin", capabilities: ["admin", "manage_users", "upload", "approve", "view"] };
const READONLY = { sub: "t@x.local", tenant_id: "acme", role: "analyst",
  user_role: "read_only_tester", capabilities: ["view", "read_only"] };

const USERS = { users: [{ id: "u1", email: "analyst@x.local", username: "analyst", display_name: "Analyst A",
  user_role: "analyst", base_role: "analyst", status: "active", assigned_client_count: 2, client_ids: ["C1", "C2"] }] };
const ROLES = { roles: [
  { user_role: "analyst", label: "Analyst", base_role: "analyst", capabilities: ["view"] },
  { user_role: "read_only_tester", label: "Read-only Tester", base_role: "analyst", capabilities: ["view", "read_only"] }] };

beforeEach(() => {
  (api.admin.listUsers as any).mockReset().mockResolvedValue(USERS);
  (api.admin.roles as any).mockReset().mockResolvedValue(ROLES);
  (api.admin.resetPassword as any).mockReset();
  (api.admin.deactivate as any).mockReset();
});

describe("Settings / Admin — RBAC-gated user management", () => {
  it("admin sees the Settings entry in the shell; non-admin does not", () => {
    const { unmount } = renderWithProviders(<Shell />, { principal: ADMIN });
    expect(screen.getByTestId("nav-settings")).toBeInTheDocument();
    unmount();
    renderWithProviders(<Shell />, { principal: READONLY });
    expect(screen.queryByTestId("nav-settings")).not.toBeInTheDocument();
  });

  it("Settings/Admin is NOT one of the 20 analytics tabs", () => {
    expect(TABS).toHaveLength(20);
    expect(TABS.find((t) => t.id === "settings" || t.path.startsWith("/settings"))).toBeUndefined();
  });

  it("User Management page renders table, create form, badges and actions", async () => {
    renderWithProviders(<AdminUsers />, { principal: ADMIN });
    await waitFor(() => expect(screen.getByTestId("au-table")).toBeInTheDocument());
    expect(screen.getByTestId("au-create-form")).toBeInTheDocument();
    expect(screen.getByTestId("au-create-btn")).toBeInTheDocument();
    expect(screen.getAllByTestId("au-role-badge").length).toBeGreaterThan(0);
    expect(screen.getByTestId("au-status-badge")).toHaveTextContent("active");
    expect(screen.getByTestId("au-client-count")).toHaveTextContent("2");
    expect(screen.getByTestId("au-reset")).toBeInTheDocument();
    expect(screen.getByTestId("au-deactivate")).toBeInTheDocument();
    expect(screen.getByTestId("au-search")).toBeInTheDocument();
  });

  it("reset password reveals the one-time temporary password from the API", async () => {
    (api.admin.resetPassword as any).mockResolvedValue({ user: { email: "analyst@x.local" }, temporary_password: "TMP-9x7Q" });
    renderWithProviders(<AdminUsers />, { principal: ADMIN });
    await waitFor(() => expect(screen.getByTestId("au-reset")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("au-reset"));
    await waitFor(() => expect(screen.getByTestId("au-temp-password")).toHaveTextContent("TMP-9x7Q"));
    expect(api.admin.resetPassword).toHaveBeenCalledWith("u1");
  });

  it("a read-only user cannot reach the admin page (capability-guarded route)", async () => {
    renderWithProviders(<AppRoutes />, { route: "/settings/users", principal: READONLY });
    // guard redirects away from the admin page — the admin create form never renders
    await waitFor(() => expect(screen.queryByTestId("au-create-form")).not.toBeInTheDocument());
    expect(api.admin.listUsers).not.toHaveBeenCalled();
  });
});
