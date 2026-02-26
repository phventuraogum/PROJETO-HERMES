import { cn } from "@/lib/utils";

interface FunnelStage {
  label: string;
  value: number;
  conversionRate?: number;
}

interface ConversionFunnelProps {
  stages: FunnelStage[];
  delay?: number;
}

export function ConversionFunnel({ stages, delay = 0 }: ConversionFunnelProps) {
  const maxValue = Math.max(...stages.map((s) => s.value));

  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border bg-card p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="mb-6 text-sm font-medium text-muted-foreground">
        Funil de Conversão
      </h3>

      <div className="space-y-3">
        {stages.map((stage, index) => {
          const widthPercentage = (stage.value / maxValue) * 100;
          const isLast = index === stages.length - 1;

          return (
            <div key={index} className="group relative">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{stage.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-foreground">
                    {stage.value.toLocaleString("pt-BR")}
                  </span>
                  {stage.conversionRate !== undefined && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {stage.conversionRate}%
                    </span>
                  )}
                </div>
              </div>

              <div className="relative h-10 overflow-hidden rounded-md bg-secondary">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-md transition-all duration-700",
                    "bg-gradient-to-r from-primary to-accent",
                    "group-hover:from-primary group-hover:to-primary"
                  )}
                  style={{ width: `${widthPercentage}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-medium text-foreground/80">
                    {widthPercentage.toFixed(0)}% do topo
                  </span>
                </div>
              </div>

              {!isLast && (
                <div className="my-2 flex justify-center">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-secondary text-xs text-muted-foreground">
                    ↓
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
