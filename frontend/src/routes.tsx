import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { TABS } from "./nav/tabs";
import { ExecutiveSummary } from "./pages/ExecutiveSummary";
import { DataOnboarding } from "./pages/DataOnboarding";
import { RenewalShell } from "./pages/RenewalShell";
import { RenewalIntelligence } from "./pages/RenewalIntelligence";
import { ClaimsDrivers } from "./pages/ClaimsDrivers";
import { SavingsSandbox } from "./pages/SavingsSandbox";
import { BalancedBenefitDesign } from "./pages/BalancedBenefitDesign";
import { RecommendedStrategy } from "./pages/RecommendedStrategy";
import { PlacementTrigger } from "./pages/PlacementTrigger";
import { WellnessShell } from "./pages/WellnessShell";
import { WellnessOverview, WellnessOpportunity, WellnessPlanner, WellnessRoi } from "./pages/Wellness";
import { AdminUsers } from "./pages/AdminUsers";
import { Placeholder } from "./pages/Placeholder";
import { Login } from "./pages/Login";
import { Gallery } from "./pages/Gallery";
import { useAuth } from "./lib/auth";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Capability guard for Settings/Admin — backend also enforces this; the client guard just
 *  avoids rendering an admin page for users who lack the capability. */
function RequireCapability({ cap, children }: { cap: string; children: React.ReactNode }) {
  const { hasCapability } = useAuth();
  return hasCapability(cap) ? <>{children}</> : <Navigate to="/executive-summary" replace />;
}

/** Top-level tabs with a single wired page (parents with sub-tabs are handled by
 *  their own nested route blocks below). */
const WIRED: Record<string, React.ReactNode> = {
  "/executive-summary": <ExecutiveSummary />,
  "/data-onboarding": <DataOnboarding />,
};

// parents render nested sub-routes, not a flat page
const NESTED = new Set(["/renewal", "/wellness"]);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Navigate to="/executive-summary" replace />} />

        {/* flat top-level tabs (all except the two parents with sub-tabs) */}
        {TABS.filter((t) => !NESTED.has(t.path)).map((t) => (
          <Route key={t.id} path={t.path}
            element={WIRED[t.path] ?? <Placeholder title={t.label} group={t.group} />} />
        ))}

        {/* Renewal Intelligence — exactly the 6 demo sub-tabs */}
        <Route path="/renewal" element={<RenewalShell />}>
          <Route index element={<RenewalIntelligence />} />
          <Route path="claims-drivers" element={<ClaimsDrivers />} />
          <Route path="savings-sandbox" element={<SavingsSandbox />} />
          <Route path="balanced-design" element={<BalancedBenefitDesign />} />
          <Route path="recommended-strategy" element={<RecommendedStrategy />} />
          <Route path="placement-trigger" element={<PlacementTrigger />} />
        </Route>

        {/* Settings / Admin — NOT an analytics tab; capability-guarded (backend-enforced too) */}
        <Route path="/settings/users" element={<RequireCapability cap="manage_users"><AdminUsers /></RequireCapability>} />

        {/* Wellness Intelligence — exactly the 4 demo sub-tabs */}
        <Route path="/wellness" element={<WellnessShell />}>
          <Route index element={<WellnessOverview />} />
          <Route path="opportunity" element={<WellnessOpportunity />} />
          <Route path="planner" element={<WellnessPlanner />} />
          <Route path="roi" element={<WellnessRoi />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/executive-summary" replace />} />
    </Routes>
  );
}
