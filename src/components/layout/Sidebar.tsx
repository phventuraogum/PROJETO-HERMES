import { useEffect, useState } from "react";
import {
  LayoutDashboard, Settings, FileText, History, Map, Kanban,
  Building2, Coins, Plus, Sliders, Search, TerminalSquare,
  Archive, Scale,
} from "lucide-react";
import { toast } from "sonner";

import LogoutButton from "@/auth/LogoutButton";
import { NavLink } from "@/components/NavLink";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getCredits, addCredits } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useOrg } from "@/tenancy/OrgContext";

const NAV_GROUPS = [
  {
    label: "Prospecção",
    items: [
      { icon: Search, label: "Enriquecer CNPJ", path: "/cnpj" },
      { icon: Scale, label: "Consulta Fiscal", path: "/consulta-fiscal" },
      { icon: TerminalSquare, label: "Query Workbench", path: "/query-workbench" },
      { icon: Settings, label: "Configurar Busca", path: "/app" },
    ],
  },
  {
    label: "Análise",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: FileText, label: "Resultados", path: "/results" },
      { icon: Archive, label: "Listas & Signals", path: "/lead-lists" },
      { icon: Map, label: "Mapa de Calor", path: "/heatmap" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { icon: Kanban, label: "Pipeline", path: "/pipeline" },
      { icon: History, label: "Histórico", path: "/history" },
    ],
  },
  {
    label: "Conta",
    items: [
      { icon: Coins, label: "Créditos", path: "/comprar-creditos" },
      { icon: Sliders, label: "Configurações", path: "/settings" },
    ],
  },
];

const Sidebar = () => {
  const { orgs, orgId, setOrgId } = useOrg();
  const currentOrg = orgs.find((org) => org.id === orgId);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    getCredits().then((result) => setCredits(result.saldo)).catch(() => setCredits(null));
  }, [orgId]);

  const handleAddCredits = async () => {
    try {
      const result = await addCredits(100);
      setCredits(result.saldo);
      toast.success("+100 créditos adicionados");
    } catch {
      toast.error("Erro ao adicionar créditos.");
    }
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/90">
      <div className="h-16 shrink-0 border-b border-sidebar-border px-4">
        <div className="flex h-full min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-surface-xs"
            style={{ background: "var(--pinn-orange)" }}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path d="M4 16L10 4l6 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 11h7" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-tight text-foreground" style={{ letterSpacing: "-0.04em" }}>
              Pinn · Hermes
            </p>
            <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">Inteligência B2B</p>
          </div>
        </div>
      </div>

      {orgs.length > 1 && (
        <div className="border-b border-sidebar-border px-3 py-3">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60">
            Organização
          </p>
          <Select value={orgId ?? "default"} onValueChange={setOrgId}>
            <SelectTrigger className="h-9 rounded-xl border-border/60 bg-muted/35 text-xs shadow-surface-xs">
              <Building2 className="mr-1.5 h-3 w-3 text-muted-foreground" />
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((org) => (
                <SelectItem key={org.id} value={org.id} className="text-xs">{org.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {orgs.length === 1 && currentOrg && (
        <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-muted/35 px-3 py-2.5 shadow-surface-xs">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--pinn-orange-light)" }}>
            <Building2 className="h-3 w-3" style={{ color: "var(--pinn-orange)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/65">Organização</p>
            <span className="block truncate text-xs font-semibold text-sidebar-foreground">{currentOrg.name}</span>
          </div>
        </div>
      )}

      <div
        className="mx-3 my-3 flex items-center justify-between rounded-2xl px-3 py-3 shadow-surface-xs"
        style={{ background: "var(--pinn-orange-light)", border: "1px solid var(--pinn-orange-border)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-surface-xs" style={{ background: "var(--pinn-orange)" }}>
            <Coins className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.18em]" style={{ color: "var(--pinn-orange-dark)" }}>
              Créditos
            </p>
            <p className="mt-1 text-sm font-black tabular-nums" style={{ letterSpacing: "-0.03em", color: "var(--pinn-orange-dark)" }}>
              {credits !== null ? credits.toLocaleString("pt-BR") : "—"}
            </p>
          </div>
        </div>
        <button
          onClick={handleAddCredits}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-0 transition-all hover:scale-[1.04] hover:opacity-90"
          style={{ background: "var(--pinn-orange)", color: "white" }}
          title="Adicionar 100 créditos (demo)"
          type="button"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4 pt-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/48">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-150",
                      isActive
                        ? "border-primary/25 bg-primary text-primary-foreground shadow-surface-sm"
                        : "border-transparent text-sidebar-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }: { isActive: boolean }) => (
                    <>
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                          isActive
                            ? "bg-black/10 text-primary-foreground"
                            : "bg-muted/70 text-muted-foreground group-hover:bg-card group-hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-sidebar-border px-3 py-3">
        <LogoutButton />
        <p className="text-center text-[10px] font-medium text-muted-foreground/40">
          Hermes v2 · Powered by Pinn
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
