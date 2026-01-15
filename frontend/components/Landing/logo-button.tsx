"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  logoSrc: string;
  alt: string;
  className?: string;
  isActive?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: {
    container: "size-[28px]",
    image: "size-[16px]",
  },
  md: {
    container: "size-[40px]",
    image: "size-[24px]",
  },
  lg: {
    container: "size-[48px]",
    image: "size-[28px]",
  },
};

const LogoButton = React.forwardRef<HTMLButtonElement, LogoButtonProps>(
  ({ className, logoSrc, alt, isActive = false, size = "md", onClick, ...props }, ref) => {
    const sizeStyle = sizeStyles[size];
    const isClickable = !!onClick;

    return (
      <button
        ref={ref}
        onClick={onClick}
        className={cn(
          "rounded-[8px] flex justify-center items-center border-[0.5px]",
          sizeStyle.container,
          // Clickable buttons: lighter bg, visible border
          // Non-clickable buttons: darker bg, subtle border
          isClickable
            ? "bg-landing-surface-600 border-landing-text-600 hover:bg-landing-surface-500 hover:border-landing-text-500"
            : "bg-landing-surface-700 border-landing-surface-400",
          { "border-landing-primary-400 hover:border-landing-primary-400": isActive },
          className
        )}
        {...props}
      >
        <Image src={logoSrc} alt={alt} width={24} height={24} className={cn("object-contain", sizeStyle.image)} />
      </button>
    );
  }
);

LogoButton.displayName = "LogoButton";

export default LogoButton;
