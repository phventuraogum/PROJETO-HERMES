import { useEffect, useState } from "react";
import { LayoutDashboard, Settings, FileText, History, Map, Kanban, Building2, Sliders, Search } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import LogoutButton from "@/auth/LogoutButton";
import { useOrg } from "@/tenancy/OrgContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const menuItems = [
  { icon: Settings,       label: "Configurar Prospecção", path: "/" },
  { icon: LayoutDashboard,label: "Dashboard",             path: "/dashboard" },
  { icon: FileText,       label: "Resultados",            path: "/results" },
  { icon: Kanban,         label: "Pipeline",              path: "/pipeline" },
  { icon: History,        label: "Histórico",             path: "/history" },
  { icon: Map,            label: "Mapa de Calor",         path: "/heatmap" },
  { icon: Search,         label: "Enriquecer CNPJ",       path: "/enriquecer-cnpj" },
  { icon: Sliders,        label: "Configurações",         path: "/settings" },
];

const Sidebar = () => {
  const { orgs, orgId, setOrgId } = useOrg();
  const currentOrg = orgs.find(o => o.id === orgId);

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
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
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
