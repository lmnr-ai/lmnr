import * as React from "react";

import { cn } from "@/lib/utils";

interface LandingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "minimal" | "outline" | "primary" | "solid";
  size?: "xs" | "sm" | "md" | "lg";
}

const LandingButton = React.forwardRef<HTMLButtonElement, LandingButtonProps>(
  ({ className, variant = "minimal", size = "md", children, ...props }, ref) => {
    const baseStyles =
      "font-sans-landing text-foreground-200 leading-normal whitespace-nowrap cursor-pointer flex items-center justify-center rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none";

    const sizeStyles = {
      xs: "px-2 py-0.5 text-xs md:text-sm",
      sm: cn("px-2 py-0.5 text-xs md:text-sm md:py-1.5", "px-1 py-0.5"),
      md: cn("md:px-5 text-xs md:text-sm md:py-3", "px-3"),
      lg: cn("md:px-6 text-sm md:text-base md:py-3", "px-4"),
    };

    const variantStyles = {
      minimal: "hover:text-foreground-50",
      solid: "bg-surface-400 hover:bg-surface-200",
      outline: "outline outline-foreground-600 hover:text-foreground-50 hover:bg-primary-foreground/5",
      primary: "bg-primary-200 text-black font-medium rounded-sm hover:bg-primary-400",
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
