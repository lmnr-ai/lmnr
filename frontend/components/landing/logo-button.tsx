"use client";

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface LogoButtonProps {
  logoSrc?: string;
  alt?: string;
  label: string;
  className?: string;
  isActive?: boolean;
  href?: string;
  onClick?: () => void;
  variant?: "labeled" | "compact";
}

const LogoButton = ({
  className,
  logoSrc,
  alt,
  label,
  isActive = false,
  onClick,
  href,
  variant = "labeled",
}: LogoButtonProps) => {
  const isClickable = !!onClick || !!href;

  const sharedClassName = cn(
    "flex items-center justify-center rounded-[8px] border-[0.5px] transition-colors",
    "bg-landing-surface-700 border-landing-text-600",
    isClickable && "hover:bg-landing-surface-500 hover:border-landing-text-500",
    variant === "labeled"
      ? "md:h-[36px] md:gap-[10px] md:pl-2 md:pr-3 h-[28px] gap-1.5 pl-1.5 pr-2"
      : "md:size-[36px] size-[28px]",
    isActive && "border-landing-primary-400 hover:border-landing-primary-400 bg-landing-surface-500",
    className
  );

  const labelClassName = cn(
    "font-sans md:text-sm md:leading-8 text-xs leading-5 whitespace-nowrap",
    isActive ? "text-landing-text-100" : "text-landing-text-300"
  );

  const content =
    variant === "labeled" ? (
      <>
        {logoSrc && (
          <Image
            src={logoSrc}
            alt={alt ?? label}
            width={24}
            height={24}
            className={cn("object-contain md:size-6 size-5 opacity-75", { "opacity-100": isActive })}
          />
        )}
        <span className={labelClassName}>{label}</span>
      </>
    ) : (
      <span className={labelClassName}>{label}</span>
    );

  if (href) {
    return (
      <Link href={href} target="_blank" rel="noopener noreferrer" className={sharedClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={sharedClassName}>
      {content}
    </button>
  );
};

export default LogoButton;
