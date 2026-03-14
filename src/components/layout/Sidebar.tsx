import { useEffect, useState } from "react";
import {
  LayoutDashboard, Settings, FileText, History, Map, Kanban,
  Building2, Coins, Plus, Sliders, Search, TerminalSquare,
  Archive, Scale, LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import LogoutButton from "@/auth/LogoutButton";
import { useOrg } from "@/tenancy/OrgContext";
import { getCredits, addCredits } from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const NAV_GROUPS = [
  {
    label: "Prospecção",
    items: [
      { icon: Search,          label: "Enriquecer CNPJ",  path: "/cnpj" },
      { icon: Scale,           label: "Consulta Fiscal",  path: "/consulta-fiscal" },
      { icon: TerminalSquare,  label: "Query Workbench",  path: "/query-workbench" },
      { icon: Settings,        label: "Configurar Busca", path: "/app" },
    ],
  },
  {
    label: "Análise",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",        path: "/dashboard" },
      { icon: FileText,        label: "Resultados",       path: "/results" },
      { icon: Archive,         label: "Listas & Signals", path: "/lead-lists" },
      { icon: Map,             label: "Mapa de Calor",    path: "/heatmap" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { icon: Kanban,          label: "Pipeline",         path: "/pipeline" },
      { icon: History,         label: "Histórico",        path: "/history" },
    ],
  },
  {
    label: "Conta",
    items: [
      { icon: Coins,           label: "Créditos",         path: "/comprar-creditos" },
      { icon: Sliders,         label: "Configurações",    path: "/settings" },
    ],
  },
];

const Sidebar = () => {
  const { orgs, orgId, setOrgId } = useOrg();
  const currentOrg = orgs.find(o => o.id === orgId);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    getCredits().then(r => setCredits(r.saldo)).catch(() => setCredits(null));
  }, [orgId]);

  const handleAddCredits = async () => {
    try {
      const r = await addCredits(100);
      setCredits(r.saldo);
      toast.success("+100 créditos adicionados");
    } catch {
      toast.error("Erro ao adicionar créditos.");
    }
  };

  return (
    <aside className="w-56 border-r border-sidebar-border bg-sidebar flex flex-col shrink-0">

      {/* Logo Pinn */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--pinn-orange)" }}>
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
              <path d="M4 16L10 4l6 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6.5 11h7" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-black tracking-tight" style={{ letterSpacing: "-0.04em", color: "var(--pinn-black)" }}>
              Pinn · Hermes
            </p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Inteligência B2B</p>
          </div>
        </div>
      </div>

      {/* Organização */}
      {orgs.length > 1 && (
        <div className="px-3 py-2.5 border-b border-sidebar-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-1">Organização</p>
          <Select value={orgId ?? "default"} onValueChange={setOrgId}>
            <SelectTrigger className="h-8 text-xs border-border/60 bg-muted/40 rounded-lg">
              <Building2 className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map(o => (
                <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {orgs.length === 1 && currentOrg && (
        <div className="px-4 py-2 border-b border-sidebar-border flex items-center gap-2">
          <div className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "var(--pinn-orange-light)" }}>
            <Building2 className="h-3 w-3" style={{ color: "var(--pinn-orange)" }} />
          </div>
          <span className="text-xs text-sidebar-foreground truncate font-semibold">{currentOrg.name}</span>
        </div>
      )}

      {/* Créditos — identidade Pinn */}
      <div className="mx-3 my-2.5 rounded-xl flex items-center justify-between px-3 py-2"
        style={{ background: "var(--pinn-orange-light)", border: "1px solid var(--pinn-orange-border)" }}>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--pinn-orange)" }}>
            <Coins className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-medium leading-none" style={{ color: "var(--pinn-orange-dark)" }}>Créditos</p>
            <p className="text-sm font-black tabular-nums mt-0.5" style={{ letterSpacing: "-0.03em", color: "var(--pinn-orange-dark)" }}>
              {credits !== null ? credits.toLocaleString("pt-BR") : "—"}
            </p>
          </div>
        </div>
        <button onClick={handleAddCredits}
          className="h-6 w-6 rounded-md flex items-center justify-center border-0 cursor-pointer transition-opacity hover:opacity-80"
          style={{ background: "var(--pinn-orange)", color: "white" }}
          title="Adicionar 100 créditos (demo)">
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/45">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 font-medium",
                    "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                  )}
                  activeClassName="text-white font-bold"
                  style={{ "--active-bg": "var(--pinn-orange)" } as React.CSSProperties}
                >
                  {({ isActive }: { isActive: boolean }) => (
                    <>
                      <div className={cn(
                        "h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-all",
                        isActive ? "bg-white/20" : "bg-muted"
                      )}
                        style={isActive ? { background: "rgba(255,255,255,0.2)" } : {}}>
                        <item.icon className="h-3.5 w-3.5" />
                      </div>
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé */}
      <div className="border-t border-sidebar-border px-3 py-3 space-y-2 shrink-0">
        <LogoutButton />
        <p className="text-[10px] text-muted-foreground/35 text-center font-medium">
          Hermes v2 · Powered by Pinn
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
