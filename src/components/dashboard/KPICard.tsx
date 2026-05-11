import { LucideIcon, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
 * KPICard — Pinn DS oficial v1.0 (BAI tile)
 * - JetBrains Mono no número (font-feature-settings tnum 1)
 * - Label uppercase tracking 0.08em (eyebrow style)
 * - Delta com arrow Lucide line-style 1.7
 * - Sem gradient overlay; surface sólida; lift translateY no hover
 * ────────────────────────────────────────────────────────────────────────── */

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

const KPICard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
}: KPICardProps) => {
  const accentBorder = {
    default: "border-border",
    primary: "border-primary/30",
    success: "border-success/30",
    warning: "border-warning/30",
  }[variant];

  const iconColor = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
  }[variant];

  return (
    <div className={cn("pinn-kpi", accentBorder)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="pinn-kpi__label">
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", iconColor)}
              strokeWidth={1.7}
            />
            <span className="truncate">{title}</span>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="pinn-kpi__value">{value}</span>
            {subtitle && (
              <span className="text-xs font-medium text-muted-foreground">
                {subtitle}
              </span>
            )}
          </div>

          {trend && (
            <div
              className={cn(
                "pinn-kpi__delta flex items-center gap-1",
                trend.positive
                  ? "pinn-kpi__delta--up"
                  : "pinn-kpi__delta--down"
              )}
            >
              {trend.positive ? (
                <ArrowUp className="h-3 w-3" strokeWidth={2} />
              ) : (
                <ArrowDown className="h-3 w-3" strokeWidth={2} />
              )}
              <span>{trend.value}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KPICard;
