import { Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpeedToLeadProps {
  p50: number;
  p90: number;
  target: number;
  unit?: string;
  delay?: number;
}

export function SpeedToLeadChart({
  p50,
  p90,
  target,
  unit = "min",
  delay = 0,
}: SpeedToLeadProps) {
  const p50Status = p50 <= target ? "success" : p50 <= target * 1.5 ? "warning" : "destructive";
  const p90Status = p90 <= target * 2 ? "success" : p90 <= target * 3 ? "warning" : "destructive";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-success";
      case "warning":
        return "text-warning";
      default:
        return "text-destructive";
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "success":
        return "bg-success/10 border-success/30";
      case "warning":
        return "bg-warning/10 border-warning/30";
      default:
        return "bg-destructive/10 border-destructive/30";
    }
  };

  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border bg-card p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-md bg-primary/10 p-2">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Speed-to-Lead
          </h3>
          <p className="text-xs text-muted-foreground/70">
            Meta: {target} {unit}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* P50 */}
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border p-4",
            getStatusBg(p50Status)
          )}
        >
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock className="h-3 w-3" />
            P50
          </div>
          <span className={cn("text-3xl font-bold", getStatusColor(p50Status))}>
            {p50}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>

        {/* P90 */}
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border p-4",
            getStatusBg(p90Status)
          )}
        >
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock className="h-3 w-3" />
            P90
          </div>
          <span className={cn("text-3xl font-bold", getStatusColor(p90Status))}>
            {p90}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Distribuição de tempo de resposta</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-success"
            style={{ width: "40%" }}
          />
          <div
            className="absolute inset-y-0 rounded-full bg-warning"
            style={{ left: "40%", width: "35%" }}
          />
          <div
            className="absolute inset-y-0 right-0 rounded-full bg-destructive"
            style={{ width: "25%" }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            &lt;5min (40%)
          </span>
          <span className="flex items-center gap-1 text-warning">
            <span className="h-2 w-2 rounded-full bg-warning" />
            5-15min (35%)
          </span>
          <span className="flex items-center gap-1 text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            &gt;15min (25%)
          </span>
        </div>
      </div>
    </div>
  );
}
