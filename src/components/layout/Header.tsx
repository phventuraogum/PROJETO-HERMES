import { Moon, Sun, Bell, HelpCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/theme/ThemeContext";

const PAGE_META = [
  { match: "/cnpj", section: "Prospecção", title: "Enriquecer CNPJ" },
  { match: "/consulta-fiscal", section: "Prospecção", title: "Consulta Fiscal" },
  { match: "/query-workbench", section: "Prospecção", title: "Query Workbench" },
  { match: "/app", section: "Prospecção", title: "Configurar Busca" },
  { match: "/dashboard", section: "Análise", title: "Dashboard" },
  { match: "/results", section: "Análise", title: "Resultados" },
  { match: "/lead-lists", section: "Análise", title: "Listas & Signals" },
  { match: "/heatmap", section: "Análise", title: "Mapa de Calor" },
  { match: "/pipeline", section: "Pipeline", title: "Pipeline" },
  { match: "/history", section: "Pipeline", title: "Histórico" },
  { match: "/comprar-creditos", section: "Conta", title: "Créditos" },
  { match: "/settings", section: "Conta", title: "Configurações" },
];

function resolvePageMeta(pathname: string) {
  return PAGE_META.find(({ match }) => pathname === match || pathname.startsWith(`${match}/`))
    ?? { section: "Workspace", title: "Painel" };
}

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const isLight = theme === "light";
  const page = resolvePageMeta(pathname);

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border/80 bg-background/88 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/65">
            {page.section}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm">
            <span className="font-black tracking-tight text-foreground" style={{ letterSpacing: "-0.03em" }}>
              Hermes
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="truncate font-medium text-foreground/80">{page.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-9 w-9 rounded-xl border border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
              >
                {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isLight ? "Modo escuro" : "Modo claro"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl border border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ajuda</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl border border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
              >
                <Bell className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Notificações</TooltipContent>
          </Tooltip>

          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-2.5 py-1.5 shadow-surface-xs">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-bold text-white" style={{ background: "var(--pinn-orange)" }}>
                AD
              </AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold leading-none text-foreground">Analista</p>
              <p className="mt-0.5 text-[11px] font-medium leading-none text-muted-foreground">Plano Pro</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
