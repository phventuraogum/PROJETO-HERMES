import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";

import Layout from "./components/layout/Layout";
import { RequireAuth } from "./auth/RequireAuth";

const Login = lazy(() => import("./pages/Login"));
const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Configure = lazy(() => import("./pages/Configure"));
const EnriquecerCnpj = lazy(() => import("./pages/EnriquecerCnpj"));
const QueryWorkbench = lazy(() => import("./pages/QueryWorkbench"));
const LeadLists = lazy(() => import("./pages/LeadLists"));
const Results = lazy(() => import("./pages/Results"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const History = lazy(() => import("./pages/History"));
const Heatmap = lazy(() => import("./pages/Heatmap"));
const Settings = lazy(() => import("./pages/Settings"));
const ComprarCreditos = lazy(() => import("./pages/ComprarCreditos"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function AuthedLayout({ children }: { children: JSX.Element }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
    </RequireAuth>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Carregando modulo...
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/app"
            element={
              <AuthedLayout>
                <Configure />
              </AuthedLayout>
            }
          />
          <Route
            path="/dashboard"
            element={
              <AuthedLayout>
                <Dashboard />
              </AuthedLayout>
            }
          />
          <Route
            path="/cnpj"
            element={
              <AuthedLayout>
                <EnriquecerCnpj />
              </AuthedLayout>
            }
          />
          <Route
            path="/query-workbench"
            element={
              <AuthedLayout>
                <QueryWorkbench />
              </AuthedLayout>
            }
          />
          <Route
            path="/lead-lists"
            element={
              <AuthedLayout>
                <LeadLists />
              </AuthedLayout>
            }
          />
          <Route
            path="/results"
            element={
              <AuthedLayout>
                <Results />
              </AuthedLayout>
            }
          />
          <Route
            path="/pipeline"
            element={
              <AuthedLayout>
                <Pipeline />
              </AuthedLayout>
            }
          />
          <Route
            path="/history"
            element={
              <AuthedLayout>
                <History />
              </AuthedLayout>
            }
          />
          <Route
            path="/heatmap"
            element={
              <AuthedLayout>
                <Heatmap />
              </AuthedLayout>
            }
          />
          <Route
            path="/settings"
            element={
              <AuthedLayout>
                <Settings />
              </AuthedLayout>
            }
          />
          <Route
            path="/comprar-creditos"
            element={
              <AuthedLayout>
                <ComprarCreditos />
              </AuthedLayout>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
