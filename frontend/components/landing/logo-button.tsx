"use client";

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface LogoButtonProps {
  logoSrc: string;
  alt: string;
  className?: string;
  isActive?: boolean;
  size?: "sm" | "md" | "lg";
  href?: string;
  onClick?: () => void;
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

const LogoButton = ({ className, logoSrc, alt, isActive = false, size = "md", onClick, href }: LogoButtonProps) => {
  const sizeStyle = sizeStyles[size];
  const isClickable = !!onClick || !!href;

  const sharedClassName = cn(
    "rounded-[8px] flex justify-center items-center border-[0.5px]",
    sizeStyle.container,
    isClickable
      ? "bg-landing-surface-600 border-landing-text-600 hover:bg-landing-surface-500 hover:border-landing-text-500"
      : "bg-landing-surface-700 border-landing-surface-400",
    { "border-landing-primary-400 hover:border-landing-primary-400 bg-landing-surface-500": isActive },
    className
  );

  const imageElement = (
    <Image
      src={logoSrc}
      alt={alt}
      width={24}
      height={24}
      className={cn("object-contain opacity-75", { "opacity-100": isActive }, sizeStyle.image)}
    />
  );

  if (href) {
    return (
      <Link href={href} target="_blank" rel="noopener noreferrer" className={sharedClassName}>
        {imageElement}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={sharedClassName}>
      {imageElement}
    </button>
  );
};

export default LogoButton;
