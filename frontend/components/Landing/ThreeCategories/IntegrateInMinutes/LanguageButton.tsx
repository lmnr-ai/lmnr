"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface LanguageButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  language: "typescript" | "python";
  isActive?: boolean;
  className?: string;
}

const LanguageButton = React.forwardRef<HTMLButtonElement, LanguageButtonProps>(
  ({ className, language, isActive = false, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "font-chivo-mono font-normal text-xs tracking-[1.68px] leading-normal whitespace-nowrap cursor-pointer",
          "px-1 py-1 rounded-sm transition-colors duration-200",
          isActive ? "text-landing-text-300" : "text-landing-text-400 hover:text-landing-text-200",
          className
        )}
        {...props}
      >
        {language === "typescript" ? "TYPESCRIPT" : "PYTHON"}
      </button>
    );
  }
);

LanguageButton.displayName = "LanguageButton";

export default LanguageButton;
