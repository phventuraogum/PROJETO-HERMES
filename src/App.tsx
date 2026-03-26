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
import NotFound from "./pages/NotFound";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";

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
              <RequireRole minRole="owner">
                <AdminPanel />
              </RequireRole>
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
