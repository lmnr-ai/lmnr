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
  ({ className, logoSrc, alt, isActive = false, size = "md", ...props }, ref) => {
    const sizeStyle = sizeStyles[size];

    return (
      <button
        ref={ref}
        className={cn(
          "bg-landing-surface-600 border border-landing-surface-500 rounded-[8px] flex justify-center items-center",
          sizeStyle.container,
          "hover:bg-landing-surface-500 hover:border-landing-text-500",
          "active:bg-landing-surface-400 active:border-landing-text-400",
          { "border-landing-primary-400": isActive },
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
