import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — Pinn DS oficial v1.0
 * - Default = CTA primário Pinn (orange, font-semibold, --sh-orange exclusiva)
 * - Press: scale(0.98) ~80ms (motion cirúrgico, sem bounce)
 * - Radii: 4px (--r-2) seguindo escala DS
 * - Ghost/link: hover orange-dark conforme regra DS
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pinn-2 text-sm font-semibold ring-offset-background transition-[background-color,color,border-color,transform,box-shadow] duration-pinn-base ease-pinn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // CTA primário — único variant que carrega --sh-orange
        default:
          "bg-pinn-orange text-pinn-white shadow-pinn-orange hover:bg-pinn-orange-dark",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Secondary BAI-style: ink no light, night-2 no dark
        outline:
          "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground",
        link:
          "text-primary underline-offset-4 hover:text-pinn-orange-dark hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-pinn-2 px-3 text-xs",
        lg: "h-11 rounded-pinn-2 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
