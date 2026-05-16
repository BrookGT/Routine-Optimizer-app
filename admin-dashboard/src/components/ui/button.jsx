import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:opacity-45 select-none",
    "active:scale-[0.985]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-text-primary text-white hover:bg-action-hover focus-visible:ring-stone-400",
        secondary:
          "bg-white border border-border text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:ring-stone-300",
        ghost:
          "bg-transparent text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:ring-stone-300",
        outline:
          "border border-border bg-transparent text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:ring-stone-300",
        danger:
          "bg-negative text-white hover:bg-red-700 focus-visible:ring-red-400",
        success:
          "bg-positive text-white hover:bg-green-700 focus-visible:ring-green-400",
        warn:
          "bg-warn text-white hover:bg-amber-700 focus-visible:ring-amber-400",
        link:
          "bg-transparent text-text-secondary underline-offset-4 hover:text-text-primary hover:underline p-0 h-auto",
      },
      size: {
        xs:   "h-7 px-2.5 text-xs rounded-md gap-1.5",
        sm:   "h-8 px-3 text-xs rounded-md",
        default: "h-9 px-4",
        lg:   "h-10 px-5 text-base",
        icon: "h-8 w-8 p-0",
        "icon-sm": "h-7 w-7 p-0 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <button
    className={cn(buttonVariants({ variant, size }), className)}
    ref={ref}
    {...props}
  />
));
Button.displayName = "Button";

export { Button, buttonVariants };
