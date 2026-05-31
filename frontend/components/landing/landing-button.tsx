import * as React from "react";

import { cn } from "@/lib/utils";

interface LandingButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  variant?: "minimal" | "outline" | "primary" | "solid";
  size?: "xs" | "sm" | "md" | "lg";
}

const LandingButton = React.forwardRef<HTMLButtonElement, LandingButtonProps>(
  ({ className, variant = "minimal", size = "md", children, ...props }, ref) => {
    const baseStyles =
      "font-sans-landing text-landing-text-200 leading-normal whitespace-nowrap cursor-pointer flex items-center justify-center rounded-md transition-colors";

    const sizeStyles = {
      xs: "px-2 py-0.5 text-xs md:text-sm",
      sm: cn("px-2 py-0.5 text-xs md:text-sm md:py-1.5", "px-1 py-0.5"),
      md: cn("md:px-5 text-xs md:text-sm md:py-3", "px-3"),
      lg: cn("md:px-6 text-sm md:text-base md:py-3", "px-4"),
    };

    const variantStyles = {
      minimal: "hover:text-landing-text-100",
      solid: "bg-landing-surface-500 hover:bg-landing-surface-400",
      outline: "outline outline-landing-text-600 hover:text-landing-text-100 hover:bg-primary-foreground/5",
      primary:
        "bg-landing-primary-400 text-white border border-white/40 hover:bg-landing-primary-300 active:bg-landing-primary-200",
    };

    return (
      <button
        type="button"
        ref={ref}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

LandingButton.displayName = "LandingButton";

export default LandingButton;
