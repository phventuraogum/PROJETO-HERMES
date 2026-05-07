import { useEffect, useState } from "react";
import { LayoutDashboard, Settings, FileText, History, Map, Kanban, Building2, Coins, Plus, Sparkles } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import LogoutButton from "@/auth/LogoutButton";
import { useOrg } from "@/tenancy/OrgContext";
import { getCredits, addCredits } from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type MenuEntry = { icon: typeof Settings; label: string; path: string };

const prospeccaoItems: MenuEntry[] = [
  { icon: Settings, label: "Configurar Busca", path: "/app" },
  { icon: Sparkles, label: "Enriquecer CNPJ", path: "/cnpj" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: FileText, label: "Resultados", path: "/results" },
];

const pipelineItems: MenuEntry[] = [
  { icon: Kanban, label: "Pipeline", path: "/pipeline" },
  { icon: History, label: "Histórico", path: "/history" },
];

function NavMenuItems({ items }: { items: MenuEntry[] }) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/"}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium border border-sidebar-border/50"
        >
          <item.icon className="h-5 w-5" />
          <span className="text-sm">{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

const Sidebar = () => {
  const { orgs, orgId, setOrgId, currentOrg } = useOrg();
  const [credits, setCredits] = useState<number | null>(null);
  const role = currentOrg?.role || "member";
  const isAdmin = role === "admin" || role === "owner";

  useEffect(() => {
    if (!isAdmin) { setCredits(null); return; }
    getCredits().then(r => setCredits(r.saldo)).catch(() => setCredits(null));
  }, [orgId, isAdmin]);

  const handleAddCredits = async () => {
    try {
      const r = await addCredits(100);
      setCredits(r.saldo);
      toast.success(`+100 créditos. Saldo: ${r.saldo}`);
    } catch {
      toast.error("Erro ao adicionar créditos.");
    }
  };

  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar flex flex-col">
      {orgs.length > 1 && (
        <div className="p-3 border-b border-sidebar-border">
          <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60 mb-1.5">Organização</p>
          <Select value={orgId ?? "default"} onValueChange={setOrgId}>
            <SelectTrigger className="h-8 text-xs border-sidebar-border bg-sidebar-accent/30">
              <Building2 className="h-3 w-3 mr-1.5" />
              <SelectValue placeholder="Selecione" />
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
        <div className="px-3 py-2 border-b border-sidebar-border flex items-center gap-2 text-xs text-sidebar-foreground/70">
          <Building2 className="h-3.5 w-3.5" />
          <span className="truncate">{currentOrg.name}</span>
        </div>
      )}
      {/* Créditos (admin only) */}
      {isAdmin && (
        <div className="px-3 py-2 border-b border-sidebar-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/80">
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            <span>{credits !== null ? credits : "—"} créditos</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-sidebar-foreground/70 hover:text-amber-400" onClick={handleAddCredits} title="Adicionar 100 créditos (demo)">
              <Plus className="h-3 w-3" />
            </Button>
            <NavLink to="/comprar-creditos" className="text-[10px] font-medium text-amber-400 hover:text-amber-300">
              Comprar
            </NavLink>
          </div>
        </div>
      )}
      <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <p className="px-4 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Prospecção</p>
          <NavMenuItems items={prospeccaoItems} />
        </div>
        <div className="space-y-1">
          <p className="px-4 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Pipeline</p>
          <NavMenuItems items={pipelineItems} />
        </div>
        {isAdmin && (
          <div className="space-y-1">
            <p className="px-4 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Análise</p>
            <NavLink to="/heatmap" className={cn("flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")} activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium border border-sidebar-border/50">
              <Map className="h-5 w-5" />
              <span className="text-sm">Mapa de Calor</span>
            </NavLink>
          </div>
        )}
      </nav>

      {/* Rodapé fixo do sidebar */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        <LogoutButton />

        <div className="p-3 rounded-lg bg-sidebar-accent/50 text-xs text-sidebar-foreground/70">
          <p className="font-medium mb-1">Projeto Hermes v1.0</p>
          <p>Plataforma de prospecção B2B data-driven</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
