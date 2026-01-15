import * as React from "react";
import { cn } from "@/lib/utils";

interface ScreenshotToggleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
}

const ScreenshotToggleButton = React.forwardRef<HTMLButtonElement, ScreenshotToggleButtonProps>(
  ({ className, isActive = false, children, ...props }, ref) => {
    const baseStyles =
      "font-chivo-mono font-normal text-sm tracking-[1.68px] leading-normal whitespace-nowrap cursor-pointer flex items-center justify-center px-5 py-2 rounded-sm transition-colors";
    
    const activeStyles = isActive
      ? "border border-landing-surface-400 text-landing-text-100"
      : "text-landing-text-200 hover:text-landing-text-100";

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          activeStyles,
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

ScreenshotToggleButton.displayName = "ScreenshotToggleButton";

export default ScreenshotToggleButton;


