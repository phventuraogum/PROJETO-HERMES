import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: "default" | "primary" | "success" | "warning" | "destructive";
  icon?: React.ReactNode;
  delay?: number;
}

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  variant = "default",
  icon,
  delay = 0,
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="h-3 w-3" />;
    if (trend.value < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = () => {
    if (!trend) return "";
    if (trend.value > 0) return "text-success";
    if (trend.value < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const getAccentColor = () => {
    switch (variant) {
      case "primary":
        return "border-l-primary";
      case "success":
        return "border-l-success";
      case "warning":
        return "border-l-warning";
      case "destructive":
        return "border-l-destructive";
      default:
        return "border-l-border";
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-card p-5",
        "transition-all duration-300 hover:border-primary/30 hover:shadow-lg",
        "border-l-4",
        getAccentColor(),
        "animate-fade-in-up"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon && (
            <div className="rounded-md bg-secondary p-2 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              {icon}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-foreground">
            {value}
          </span>
          {subtitle && (
            <span className="text-sm text-muted-foreground">{subtitle}</span>
          )}
        </div>

        {trend && (
          <div className={cn("mt-3 flex items-center gap-1 text-sm", getTrendColor())}>
            {getTrendIcon()}
            <span className="font-medium">
              {trend.value > 0 ? "+" : ""}
              {trend.value}%
            </span>
            {trend.label && (
              <span className="text-muted-foreground">{trend.label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
