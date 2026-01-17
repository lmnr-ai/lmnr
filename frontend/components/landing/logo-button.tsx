"use client";

import Image from "next/image";
import * as React from "react";

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
    container: "md:size-[28px] size-[24px]",
    image: "md:size-[16px] size-[14px]",
  },
  md: {
    container: "md:size-[40px] size-[32px]",
    image: "md:size-[24px] size-[18px]",
  },
  lg: {
    container: "md:size-[48px] size-[40px]",
    image: "md:size-[28px] size-[24px]",
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
          { "border-landing-primary-400 hover:border-landing-primary-400 bg-landing-surface-500": isActive },
          className
        )}
        {...props}
      >
        <Image
          src={logoSrc}
          alt={alt}
          width={24}
          height={24}
          className={cn("object-contain opacity-75", { "opacity-100": isActive }, sizeStyle.image)}
        />
      </button>
    );
  }
);

LogoButton.displayName = "LogoButton";

export default LogoButton;
