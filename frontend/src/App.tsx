import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { QueryProvider } from "./lib/query";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryProvider>
  );
}
