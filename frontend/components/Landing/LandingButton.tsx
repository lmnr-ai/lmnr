import * as React from "react";
import { cn } from "@/lib/utils";

interface LandingButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "minimal" | "outline" | "primary";
  size?: "sm" | "md";
}

const LandingButton = React.forwardRef<HTMLDivElement, LandingButtonProps>(
  ({ className, variant = "minimal", size = "md", children, ...props }, ref) => {
    const baseStyles =
      "font-chivo-mono font-normal text-sm text-landing-text-300 tracking-[1.68px] leading-normal whitespace-nowrap cursor-pointer flex items-center justify-center rounded-sm transition-colors";

    const variantStyles = {
      minimal: size === "sm" ? "px-2 py-2 hover:text-landing-text-100" : "px-4 py-1 hover:text-landing-text-100",
      outline:
        size === "sm"
          ? "border border-landing-text-600 px-4 py-2 hover:text-landing-text-100 hover:border-landing-text-400"
          : "border border-landing-text-600 px-5 py-2.5 hover:text-landing-text-100 hover:border-landing-text-400",
      primary:
        size === "sm"
          ? "bg-landing-primary-400 text-white px-4 py-2 border border-white/40 hover:bg-landing-primary-300 active:bg-landing-primary-200"
          : "bg-landing-primary-400 text-white px-5 py-2.5 border border-white/40 hover:bg-landing-primary-300 active:bg-landing-primary-200",
    };

    return (
      <div ref={ref} className={cn(baseStyles, variantStyles[variant], className)} {...props}>
        {children}
      </div>
    );
  }
);

LandingButton.displayName = "LandingButton";

export default LandingButton;
