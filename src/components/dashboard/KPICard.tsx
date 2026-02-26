import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    positive: boolean;
  };
  variant?: "default" | "primary" | "success" | "warning";
}

const KPICard = ({ title, value, subtitle, icon: Icon, trend, variant = "default" }: KPICardProps) => {
  const variantClasses = {
    default: "border-border",
    primary: "border-primary/30 bg-primary/5",
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
  };

  return (
    <Card className={cn("relative overflow-hidden transition-all hover:shadow-lg", variantClasses[variant])}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold tracking-tight mb-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <p className={cn("text-xs mt-2 font-medium", trend.positive ? "text-success" : "text-destructive")}>
                {trend.positive ? "↑" : "↓"} {trend.value}
              </p>
            )}
          </div>
          <div
            className={cn(
              "p-3 rounded-lg",
              variant === "primary" && "bg-primary/20 text-primary",
              variant === "success" && "bg-success/20 text-success",
              variant === "warning" && "bg-warning/20 text-warning",
              variant === "default" && "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KPICard;
