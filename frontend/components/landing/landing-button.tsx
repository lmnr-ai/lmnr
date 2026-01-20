import * as React from "react";

import { cn } from "@/lib/utils";

interface LandingButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  variant?: "minimal" | "outline" | "primary";
  size?: "sm" | "md";
}

const LandingButton = React.forwardRef<HTMLButtonElement, LandingButtonProps>(
  ({ className, variant = "minimal", size = "md", children, ...props }, ref) => {
    const baseStyles = cn(
      "font-sans font-normal md:text-sm text-landing-text-300 tracking-[0.02em] leading-normal whitespace-nowrap cursor-pointer flex items-center justify-center rounded-sm transition-colors",
      "text-xs"
    );

    const variantStyles = {
      minimal:
        size === "sm"
          ? "px-2 py-2 hover:text-landing-text-100"
          : cn("md:px-4 md:py-1 hover:text-landing-text-100", "px-3 py-0.5"),
      outline:
        size === "sm"
          ? "border border-landing-text-600 px-4 py-2 hover:text-landing-text-100 hover:border-landing-text-400"
          : cn(
              "border border-landing-text-600 md:px-5 md:py-2.5 hover:text-landing-text-100 hover:border-landing-text-400",
              "px-3 py-1.5"
            ),
      primary:
        size === "sm"
          ? "bg-landing-primary-400 text-white px-4 py-2 border border-white/40 hover:bg-landing-primary-300 active:bg-landing-primary-200"
          : cn(
              "bg-landing-primary-400 text-white md:px-5 md:py-2.5 border border-white/40 hover:bg-landing-primary-300 active:bg-landing-primary-200",
              "px-3 py-1.5"
            ),
    };

    return (
      <button type="button" ref={ref} className={cn(baseStyles, variantStyles[variant], className)} {...props}>
        {children}
      </button>
    );
  }
);

LandingButton.displayName = "LandingButton";

export default LandingButton;
