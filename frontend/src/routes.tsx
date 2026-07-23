import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { TABS } from "./nav/tabs";
import { ExecutiveSummary } from "./pages/ExecutiveSummary";
import { DataOnboarding } from "./pages/DataOnboarding";
import { Claims } from "./pages/Claims";
import { Ailment } from "./pages/Ailment";
import { Hospital } from "./pages/Hospital";
import { EmployeeFamily } from "./pages/EmployeeFamily";
import { Demographics } from "./pages/Demographics";
import { SIUtilization } from "./pages/SIUtilization";
import { Settlement } from "./pages/Settlement";
import { Maternity } from "./pages/Maternity";
import { Rejection } from "./pages/Rejection";
import { BrokerPortfolio } from "./pages/BrokerPortfolio";
import { ClientPortfolio } from "./pages/ClientPortfolio";
import { DataQuality } from "./pages/DataQuality";
import { ExportClientPack } from "./pages/ExportClientPack";
import { ClientPackPrint } from "./pages/ClientPackPrint";
import { AskBenefitIQ } from "./pages/AskBenefitIQ";
import { RenewalShell } from "./pages/RenewalShell";
import { RenewalIntelligence } from "./pages/RenewalIntelligence";
import { ClaimsDrivers } from "./pages/ClaimsDrivers";
import { SavingsSandbox } from "./pages/SavingsSandbox";
import { BalancedBenefitDesign } from "./pages/BalancedBenefitDesign";
import { RecommendedStrategy } from "./pages/RecommendedStrategy";
import { PlacementTrigger } from "./pages/PlacementTrigger";
import { WellnessShell } from "./pages/WellnessShell";
import { WellnessOverview, WellnessOpportunity, WellnessPlanner, WellnessRoi } from "./pages/Wellness";
import { BenchmarkingShell } from "./pages/BenchmarkingShell";
import { BenchmarkOverview, BenchmarkFeatures, BenchmarkPolicyTerms, BenchmarkPeer, BenchmarkGaps, BenchmarkDiscussion, BenchmarkEvidence } from "./pages/Benchmarking";
import { PlacementShell } from "./pages/PlacementShell";
import { PlacementOverview, PlacementIncumbentDefence, PlacementRfqReadiness, PlacementQuoteComparison, PlacementTermsComparison, PlacementRecommendation, PlacementEvidence } from "./pages/Placement";
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
  "/claims": <Claims />,
  "/ailment": <Ailment />,
  "/hospital": <Hospital />,
  "/employee-family": <EmployeeFamily />,
  "/demographics": <Demographics />,
  "/si-utilization": <SIUtilization />,
  "/settlement": <Settlement />,
  "/maternity": <Maternity />,
  "/rejection": <Rejection />,
  "/broker-portfolio": <BrokerPortfolio />,
  "/client-portfolio": <ClientPortfolio />,
  "/source-evidence": <DataQuality />,
  "/export": <ExportClientPack />,
  "/ask-benefitiq": <AskBenefitIQ />,
};

// parents render nested sub-routes, not a flat page
const NESTED = new Set(["/renewal", "/wellness", "/benchmarking", "/placement"]);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/gallery" element={<Gallery />} />
      {/* Print-ready board pack — authed, rendered full-screen (no Shell chrome) for Print → PDF */}
      <Route path="/export/print" element={<RequireAuth><ClientPackPrint /></RequireAuth>} />
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

        {/* Benefits & Benchmarking — parent tab with exactly the 7 benchmarking sub-tabs */}
        <Route path="/benchmarking" element={<BenchmarkingShell />}>
          <Route index element={<BenchmarkOverview />} />
          <Route path="features" element={<BenchmarkFeatures />} />
          <Route path="policy-terms" element={<BenchmarkPolicyTerms />} />
          <Route path="peer-comparison" element={<BenchmarkPeer />} />
          <Route path="gap-analysis" element={<BenchmarkGaps />} />
          <Route path="discussion-points" element={<BenchmarkDiscussion />} />
          <Route path="evidence" element={<BenchmarkEvidence />} />
        </Route>

        {/* Placement Intelligence — parent tab with exactly the 7 placement sub-tabs */}
        <Route path="/placement" element={<PlacementShell />}>
          <Route index element={<PlacementOverview />} />
          <Route path="incumbent-defence" element={<PlacementIncumbentDefence />} />
          <Route path="rfq-readiness" element={<PlacementRfqReadiness />} />
          <Route path="quote-comparison" element={<PlacementQuoteComparison />} />
          <Route path="terms-comparison" element={<PlacementTermsComparison />} />
          <Route path="recommendation" element={<PlacementRecommendation />} />
          <Route path="evidence" element={<PlacementEvidence />} />
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
