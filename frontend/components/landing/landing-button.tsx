import * as React from "react";

import { cn } from "@/lib/utils";

interface LandingButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  variant?: "minimal" | "outline" | "primary";
  size?: "sm" | "md" | "lg";
}

const LandingButton = React.forwardRef<HTMLButtonElement, LandingButtonProps>(
  ({ className, variant = "minimal", size = "md", children, ...props }, ref) => {
    const baseStyles =
      "font-sans font-normal text-landing-text-300 tracking-[0.02em] leading-normal whitespace-nowrap cursor-pointer flex items-center justify-center rounded-sm transition-colors";

    const sizeStyles = {
      sm: "px-4 py-2 text-xs md:text-sm",
      md: cn("md:px-5 md:py-2.5 text-xs md:text-sm", "px-3 py-1.5"),
      lg: cn("md:px-6 md:py-2.5 text-sm md:text-base", "px-4 py-1.5"),
    };

    const variantStyles = {
      minimal: "hover:text-landing-text-100",
      outline:
        "outline outline-landing-text-600 hover:text-landing-text-100 hover:outline-landing-text-400 outline-offset-1",
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
