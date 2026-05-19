import {
  LayoutDashboard,
  Settings,
  FileText,
  History,
  Map,
  Kanban,
  Building2,
  ScanSearch,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import LogoutButton from "@/auth/LogoutButton";
import { useOrg } from "@/tenancy/OrgContext";
import { BRAND } from "@/config/brand";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MenuEntry = { icon: typeof Settings; label: string; path: string };

/* ─────────────────────────────────────────────────────────────────────────────
 * Sidebar — Pinn DS oficial v1.0 (família Pinn BAI)
 * - Largura 232px (alinhado ao BAI)
 * - Surface dark (--pinn-night) no dark; white com hairlines no light
 * - Sem AI-cliché icons (Sparkles → ScanSearch para "Enriquecer CNPJ")
 * - Nav active: bg accent + ink/orange-700 (light) ou night-2 (dark)
 * ────────────────────────────────────────────────────────────────────────── */

const prospeccaoItems: MenuEntry[] = [
  { icon: Settings, label: "Configurar Busca", path: "/app" },
  { icon: ScanSearch, label: "Enriquecer CNPJ", path: "/cnpj" },
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
            "flex items-center gap-3 px-3 py-2.5 rounded-pinn-2 transition-colors duration-pinn-base ease-pinn",
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
          <span className="text-[13.5px]">{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

const Sidebar = () => {
  const { orgs, orgId, setOrgId, currentOrg } = useOrg();
  const role = currentOrg?.role || "member";
  const isAdmin = role === "admin" || role === "owner";

  return (
    <aside className="w-[232px] shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
      {/* Brand block */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4 border-b border-sidebar-border">
        <svg
          viewBox="0 0 200 200"
          className="h-5 w-5 text-pinn-orange shrink-0"
          fill="currentColor"
          aria-hidden
        >
          <path d="M70 50 L130 50 L130 80 L100 80 L100 120 L70 120 Z" />
          <path d="M130 80 L130 150 L70 150 L70 120 L100 120 L100 80 Z" />
        </svg>
        <span className="text-[15px] font-bold tracking-tight text-foreground">
          {BRAND.product}
        </span>
        <span className="ml-auto font-mono-pinn text-[10px] tracking-wider text-muted-foreground">
          v1.0
        </span>
      </div>

      {/* Org selector */}
      {orgs.length > 1 && (
        <div className="px-3 pt-3 pb-2 border-b border-sidebar-border">
          <p className="font-mono-pinn text-[10px] uppercase tracking-wider text-sidebar-foreground/55 mb-1.5">
            Organização
          </p>
          <Select value={orgId ?? "default"} onValueChange={setOrgId}>
            <SelectTrigger className="h-8 text-xs border-sidebar-border bg-transparent">
              <Building2 className="h-3 w-3 mr-1.5" />
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-xs">
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {orgs.length === 1 && currentOrg && (
        <div className="px-4 py-2.5 border-b border-sidebar-border flex items-center gap-2 text-xs text-sidebar-foreground/70">
          <Building2 className="h-3.5 w-3.5" strokeWidth={1.7} />
          <span className="truncate">{currentOrg.name}</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        <div className="space-y-0.5">
          <p className="px-3 mb-1.5 font-mono-pinn text-[10px] uppercase tracking-wider text-sidebar-foreground/55">
            Prospecção
          </p>
          <NavMenuItems items={prospeccaoItems} />
        </div>
        <div className="space-y-0.5">
          <p className="px-3 mb-1.5 font-mono-pinn text-[10px] uppercase tracking-wider text-sidebar-foreground/55">
            Pipeline
          </p>
          <NavMenuItems items={pipelineItems} />
        </div>
        {isAdmin && (
          /* JUN 5.3 · seção "Master Mode" demarcada visualmente
             Wrap com border-l de cor primary + label com badge */
          <div className="space-y-0.5 -mx-1 px-1 border-l-2 border-primary/50">
            <p className="px-3 mb-1.5 font-mono-pinn text-[10px] uppercase tracking-wider text-primary/80 flex items-center gap-1.5">
              Análise
              <span className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[8.5px] font-bold tracking-wider leading-none border border-primary/30">
                ADMIN
              </span>
            </p>
            <NavLink
              to="/heatmap"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-pinn-2 transition-colors duration-pinn-base ease-pinn",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
            >
              <Map className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
              <span className="text-[13.5px]">Mapa de Calor</span>
            </NavLink>
          </div>
        )}
      </nav>

      {/* Rodapé fixo */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-3">
        <LogoutButton />
        <div className="px-3 py-2.5 rounded-pinn-2 border border-sidebar-border text-[11px] text-sidebar-foreground/65 leading-snug">
          <p className="font-semibold text-sidebar-foreground/85 mb-0.5">
            Hermes <span className="font-mono-pinn text-[10px] text-sidebar-foreground/55">v1.0</span>
          </p>
          <p>Plataforma de prospecção B2B data-driven</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
