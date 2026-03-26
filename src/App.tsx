import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";

import Layout from "./components/layout/Layout";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Configure from "./pages/Configure";
import Results from "./pages/Results";
import Pipeline from "./pages/Pipeline";
import History from "./pages/History";
import Heatmap from "./pages/Heatmap";
import Settings from "./pages/Settings";
import ComprarCreditos from "./pages/ComprarCreditos";
import AdminPanel from "./pages/AdminPanel";
import EnriquecerCnpj from "./pages/EnriquecerCnpj";
import ConsultaFiscal from "./pages/ConsultaFiscal";
import QueryWorkbench from "./pages/QueryWorkbench";
import LeadLists from "./pages/LeadLists";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { RequireMaster } from "./auth/RequireMaster";

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
        <Route
          path="/comprar-creditos"
          element={
            <AuthedLayout>
              <RequireRole minRole="admin">
                <ComprarCreditos />
              </RequireRole>
            </AuthedLayout>
          }
        />

        <Route
          path="/admin"
          element={
            <AuthedLayout>
              <RequireMaster>
                <AdminPanel />
              </RequireMaster>
            </AuthedLayout>
          }
        />
        <Route
          path="/cnpj"
          element={
            <AuthedLayout>
              <RequireMaster>
                <EnriquecerCnpj />
              </RequireMaster>
            </AuthedLayout>
          }
        />
        <Route
          path="/consulta-fiscal"
          element={
            <AuthedLayout>
              <RequireMaster>
                <ConsultaFiscal />
              </RequireMaster>
            </AuthedLayout>
          }
        />
        <Route
          path="/query-workbench"
          element={
            <AuthedLayout>
              <RequireMaster>
                <QueryWorkbench />
              </RequireMaster>
            </AuthedLayout>
          }
        />
        <Route
          path="/lead-lists"
          element={
            <AuthedLayout>
              <RequireMaster>
                <LeadLists />
              </RequireMaster>
            </AuthedLayout>
          }
        />

        {/* FALLBACK */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
