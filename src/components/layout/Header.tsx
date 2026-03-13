import { MoonStar, SunMedium, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/theme/ThemeContext";

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
        <Button
          variant="outline"
          size="sm"
          onClick={toggleTheme}
          className="gap-2 border-border/70 bg-background/70 text-foreground hover:bg-accent/60"
        >
          {isLight ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
          {isLight ? "Dark mode" : "Light mode"}
        </Button>
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
