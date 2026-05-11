import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
 * MetricCard — Pinn DS oficial v1.0
 * Variant via accent left-border (4px), surface sólida (sem gradient overlay).
 * Número em JetBrains Mono (.pinn-stat-style) com tabular nums.
 * Sem hover-only effects que dependem de gradient.
 * ────────────────────────────────────────────────────────────────────────── */

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
    if (trend.value > 0) return <ArrowUp className="h-3 w-3" strokeWidth={2} />;
    if (trend.value < 0) return <ArrowDown className="h-3 w-3" strokeWidth={2} />;
    return <Minus className="h-3 w-3" strokeWidth={2} />;
  };

  const getTrendColor = () => {
    if (!trend) return "";
    if (trend.value > 0) return "text-success";
    if (trend.value < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const accentBorder = {
    primary: "border-l-primary",
    success: "border-l-success",
    warning: "border-l-warning",
    destructive: "border-l-destructive",
    default: "border-l-border",
  }[variant];

  return (
    <div
      className={cn(
        "group relative rounded-pinn-3 border border-border bg-card p-5",
        "border-l-4 shadow-pinn-1",
        "transition-[border-color,box-shadow,transform] duration-pinn-base ease-pinn",
        "hover:border-primary/30 hover:shadow-pinn-2 hover:-translate-y-0.5",
        "animate-pinn-fade-in",
        accentBorder
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <p className="pinn-kpi__label !mb-0">{title}</p>
        {icon && (
          <div className="rounded-pinn-2 bg-muted p-1.5 text-muted-foreground transition-colors duration-pinn-base ease-pinn group-hover:bg-primary/10 group-hover:text-primary">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono-pinn text-[28px] font-bold tracking-tight leading-none text-foreground">
          {value}
        </span>
        {subtitle && (
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>

      {trend && (
        <div
          className={cn(
            "mt-3 flex items-center gap-1 text-xs font-mono-pinn",
            getTrendColor()
          )}
        >
          {getTrendIcon()}
          <span className="font-semibold">
            {trend.value > 0 ? "+" : ""}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-muted-foreground font-sans">
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
