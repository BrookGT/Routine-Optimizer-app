import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-200 hover:from-indigo-600 hover:to-violet-600 hover:shadow-md hover:shadow-indigo-200 active:scale-[0.98]",
        secondary:
          "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]",
        ghost:
          "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]",
        danger:
          "bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm shadow-rose-200 hover:from-rose-600 hover:to-red-600 active:scale-[0.98]",
        success:
          "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-200 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm:      "h-8 px-3 text-xs rounded-lg",
        lg:      "h-12 px-6 text-base",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});

Button.displayName = "Button";

export { Button, buttonVariants };
