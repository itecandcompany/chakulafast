import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * h-11 (44px) on touch, h-9 (36px) from md up.
 *
 * 44px is the minimum comfortable touch target in both Apple's HIG and
 * WCAG 2.5.5. The shadcn default of 36px is built for a mouse, and on a phone
 * it reads as a thin strip that is fiddly to hit -- which is exactly how the
 * sign-in fields looked on a real handset.
 *
 * text-base rather than text-sm on mobile is load-bearing too, and already
 * correct here: iOS zooms the whole page when a focused input is under 16px.
 */

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm md:h-9 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
