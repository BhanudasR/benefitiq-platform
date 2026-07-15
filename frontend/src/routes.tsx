import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { TABS } from "./nav/tabs";
import { ExecutiveSummary } from "./pages/ExecutiveSummary";
import { DataOnboarding } from "./pages/DataOnboarding";
import { Placeholder } from "./pages/Placeholder";
import { Login } from "./pages/Login";
import { Gallery } from "./pages/Gallery";
import { useAuth } from "./lib/auth";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

const WIRED: Record<string, React.ReactNode> = {
  "/executive-summary": <ExecutiveSummary />,
  "/data-onboarding": <DataOnboarding />,
};

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Navigate to="/executive-summary" replace />} />
        {TABS.map((t) => (
          <Route key={t.id} path={t.path}
            element={WIRED[t.path] ?? <Placeholder title={t.label} group={t.group} />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/executive-summary" replace />} />
    </Routes>
  );
}
