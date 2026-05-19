import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";

import Layout from "./components/layout/Layout";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";

// JUN 4.1 · code-splitting por rota.
// Landing + Login ficam eager (rotas públicas, custo de cold-start no primeiro paint).
// Resto vai lazy — reduz JS inicial de ~1.93MB para chunks por rota.
import Landing from "./pages/Landing";
import Login from "./pages/Login";

const Dashboard      = lazy(() => import("./pages/Dashboard"));
const Configure      = lazy(() => import("./pages/Configure"));
const Results        = lazy(() => import("./pages/Results"));
const Pipeline       = lazy(() => import("./pages/Pipeline"));
const History        = lazy(() => import("./pages/History"));
const Heatmap        = lazy(() => import("./pages/Heatmap"));
const Settings       = lazy(() => import("./pages/Settings"));
const EnriquecerCnpj = lazy(() => import("./pages/EnriquecerCnpj"));
const NotFound       = lazy(() => import("./pages/NotFound"));

// Fallback minimalista — paleta DS, sem flicker.
function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient();

function AuthedLayout({ children }: { children: JSX.Element }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
    </RequireAuth>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* LANDING PAGE (publica - página inicial) */}
        <Route path="/" element={<Landing />} />

        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* ROTAS PROTEGIDAS */}
        <Route
          path="/app"
          element={
            <AuthedLayout>
              <Configure />
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
          path="/dashboard"
          element={
            <AuthedLayout>
              <Dashboard />
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
              <RequireRole minRole="admin">
                <Heatmap />
              </RequireRole>
            </AuthedLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthedLayout>
              <RequireRole minRole="admin">
                <Settings />
              </RequireRole>
            </AuthedLayout>
          }
        />
        {/* FALLBACK */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
