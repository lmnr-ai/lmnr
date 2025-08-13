import * as React from "react";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  title: string;
  subtitle: string;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

export default function FeatureCard({
  title,
  subtitle,
  className,
  titleClassName,
  subtitleClassName,
}: FeatureCardProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <h3 className={cn("text-2xl text-white font-semibold font-title tracking-normal", titleClassName)}>{title}</h3>
      <p className={cn("text-sm text-white/80 font-title tracking-normal font-semibold", subtitleClassName)}>
        {subtitle}
      </p>
    </div>
  );
}