import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";

interface HealthItem {
  label: string;
  value: number;
  target: number;
  unit?: string;
}

interface HealthIndicatorProps {
  title: string;
  items: HealthItem[];
  delay?: number;
}

export function HealthIndicator({ title, items, delay = 0 }: HealthIndicatorProps) {
  const getStatus = (value: number, target: number) => {
    const ratio = value / target;
    if (ratio >= 0.9) return "success";
    if (ratio >= 0.7) return "warning";
    return "destructive";
  };

  const getIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      default:
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getBarColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-success";
      case "warning":
        return "bg-warning";
      default:
        return "bg-destructive";
    }
  };

  const overallScore = Math.round(
    items.reduce((acc, item) => acc + (item.value / item.target) * 100, 0) / items.length
  );

  const overallStatus = overallScore >= 90 ? "success" : overallScore >= 70 ? "warning" : "destructive";

  return (
    <div
      className="animate-pinn-fade-in rounded-pinn-3 border border-border bg-card p-5 shadow-pinn-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="pinn-eyebrow !text-muted-foreground">{title}</h3>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-pinn-pill px-2.5 py-1 text-xs font-semibold font-mono-pinn",
            overallStatus === "success" && "bg-success/12 text-success",
            overallStatus === "warning" && "bg-warning/12 text-warning",
            overallStatus === "destructive" && "bg-destructive/12 text-destructive"
          )}
        >
          {getIcon(overallStatus)}
          <span>{overallScore}%</span>
        </div>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => {
          const status = getStatus(item.value, item.target);
          const percentage = Math.min((item.value / item.target) * 100, 100);

          return (
            <div key={index}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {getIcon(status)}
                  <span className="text-foreground">{item.label}</span>
                </div>
                <span className="font-mono-pinn font-semibold text-foreground">
                  {item.value}{item.unit || "%"} / {item.target}{item.unit || "%"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-pinn-pill bg-muted">
                <div
                  className={cn(
                    "h-full rounded-pinn-pill transition-[width] duration-500 ease-pinn-out",
                    getBarColor(status)
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
