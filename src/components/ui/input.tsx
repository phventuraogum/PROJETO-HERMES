import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — Pinn DS oficial v1.0
 * - rounded-pinn-2 (4px = --r-2)
 * - hairline border, focus ring orange via --ring
 * - bg-card no light (white), bg-muted no dark (night-2)
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-pinn-2 border border-input bg-card px-3 py-2 text-base text-foreground ring-offset-background transition-colors duration-pinn-base ease-pinn",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-muted",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
