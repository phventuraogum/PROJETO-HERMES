import { Moon, Sun, Bell, HelpCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/theme/ThemeContext";
import { BRAND } from "@/config/brand";

/* ─────────────────────────────────────────────────────────────────────────────
 * Header — Pinn DS oficial v1.0
 * Sticky, h-16, hairline rule, sem blur exagerado.
 * Eyebrow uppercase tracking 0.08em (DS rule). Breadcrumb "Hermes / {página}".
 * ────────────────────────────────────────────────────────────────────────── */

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
  { match: "/settings", section: "Conta", title: "Configurações" },
];

function resolvePageMeta(pathname: string) {
  return (
    PAGE_META.find(({ match }) => pathname === match || pathname.startsWith(`${match}/`)) ?? {
      section: "Workspace",
      title: "Painel",
    }
  );
}

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const isLight = theme === "light";
  const page = resolvePageMeta(pathname);

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-4 px-5 sm:px-6">
        <div className="min-w-0">
          <p className="pinn-eyebrow text-muted-foreground/75">{page.section}</p>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm">
            <span
              className="font-bold tracking-tight text-foreground"
              style={{ letterSpacing: "-0.01em" }}
            >
              {BRAND.product}
            </span>
            {BRAND.productAlias && (
              <span className="font-mono-pinn text-[10px] uppercase tracking-wider text-muted-foreground/60">
                ({BRAND.productAlias})
              </span>
            )}
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate font-medium text-foreground/85">{page.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-9 w-9 rounded-pinn-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {isLight ? <Moon className="h-4 w-4" strokeWidth={1.7} /> : <Sun className="h-4 w-4" strokeWidth={1.7} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isLight ? "Modo escuro" : "Modo claro"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-pinn-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" strokeWidth={1.7} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ajuda</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-pinn-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Bell className="h-4 w-4" strokeWidth={1.7} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Notificações</TooltipContent>
          </Tooltip>

          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

          <div className="flex items-center gap-2 rounded-pinn-pill border border-border bg-card px-2.5 py-1.5">
            <Avatar className="h-7 w-7">
              <AvatarFallback
                className="text-[11px] font-bold text-pinn-white"
                style={{ background: "var(--pinn-orange)" }}
              >
                AD
              </AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 sm:block pr-1">
              <p className="truncate text-[13px] font-semibold leading-none text-foreground">
                Analista
              </p>
              <p className="mt-0.5 text-[10.5px] font-medium leading-none text-muted-foreground">
                Plano Pro
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
