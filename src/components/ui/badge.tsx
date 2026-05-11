import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — Pinn DS oficial v1.0
 * Pills (rounded-full) são reservadas a chips/tags conforme regra DS.
 * Variants funcionais (success/warning/score) usam .pinn-score / .pinn-pill (em index.css).
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-pinn-pill border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-pinn-base ease-pinn focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-pinn-orange-dark",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline:
          "border-border text-foreground",
        // Wash variant — orange-light no light, orange/12 no dark (auto via .surface-wash)
        wash:
          "border-transparent bg-pinn-orange-light text-pinn-orange-700 dark:bg-primary/12 dark:text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
