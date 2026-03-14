import { Moon, Sun, Bell, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/theme/ThemeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 sticky top-0 z-50 shrink-0"
      style={{ background: "var(--pinn-bg, #F5F5F3)" }}>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-black" style={{ letterSpacing: "-0.03em", color: "var(--pinn-black)" }}>Hermes</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground font-medium">Dashboard</span>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={toggleTheme}
              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg">
              {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isLight ? "Modo escuro" : "Modo claro"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Ajuda</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg">
              <Bell className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Notificações</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" />

        <div className="flex items-center gap-2.5 pl-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs font-bold text-white"
              style={{ background: "var(--pinn-orange)" }}>
              AD
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-sm font-bold leading-none" style={{ letterSpacing: "-0.02em" }}>Analista</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-none font-medium">Pro</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
