import { MoonStar, SunMedium, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/theme/ThemeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              PROJETO HERMES
            </h1>
            <p className="text-xs text-muted-foreground">B2B Intelligence Platform</p>
          </div>
        </div>
        <div className="h-8 w-px bg-border ml-2" />
        <div className="text-sm text-muted-foreground">
          Workspace: <span className="text-foreground font-medium">Default</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isLight ? "Ativar dark mode" : "Ativar light mode"}
              aria-pressed={isLight}
              className="group relative inline-flex h-10 items-center rounded-full border border-border/70 bg-background/80 p-1 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span
                className={cn(
                  "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-gradient-to-r from-primary to-secondary shadow-[var(--glow-primary)] transition-transform duration-300 ease-out",
                  isLight ? "translate-x-full" : "translate-x-0",
                )}
              />
              <span
                className={cn(
                  "relative z-10 flex min-w-[4.5rem] items-center justify-center gap-1.5 px-3 transition-colors",
                  isLight ? "text-muted-foreground/80" : "text-primary-foreground",
                )}
              >
                <MoonStar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Escuro</span>
              </span>
              <span
                className={cn(
                  "relative z-10 flex min-w-[4.5rem] items-center justify-center gap-1.5 px-3 transition-colors",
                  isLight ? "text-primary-foreground" : "text-muted-foreground/80",
                )}
              >
                <SunMedium className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Claro</span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isLight ? "Modo claro ativo" : "Modo escuro ativo"}
          </TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Ajuda
        </Button>
        <div className="h-8 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/20 text-primary text-xs">AD</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">Analista</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
