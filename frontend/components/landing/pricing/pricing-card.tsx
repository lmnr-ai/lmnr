import { Check, Minus } from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";

export interface PricingFeature {
  label: string;
  value: string;
  subtext?: string;
}

export interface PricingCardProps {
  className?: string;
  title: string;
  description?: string;
  price: string | React.ReactNode;
  priceSuffix?: string;
  features: PricingFeature[];
  highlighted?: boolean;
  badge?: string;
}

export default function PricingCard({
  className,
  title,
  description,
  features,
  price,
  priceSuffix = "/ month",
  highlighted = false,
  badge,
}: PricingCardProps) {
  return (
    <div className={cn("flex flex-col space-y-6 text-base py-4", className)}>
      <div className="shrink space-y-3">
        <div className="flex items-center gap-2">
          <h1
            className={cn(
              "text-2xl font-space-grotesk font-medium",
              highlighted ? "text-landing-text-100" : "text-landing-text-200"
            )}
          >
            {title}
          </h1>
          {badge && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-landing-primary-400 text-white">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p
            className={cn(
              "text-sm",
              highlighted ? "text-landing-text-200" : "text-landing-text-400"
            )}
          >
            {description}
          </p>
        )}
        <div className="flex items-baseline gap-1">
          <h1 className="text-4xl font-space-grotesk text-landing-text-100 font-semibold tracking-tight">{price}</h1>
          {priceSuffix && (
            <span
              className={cn(
                "text-sm",
                highlighted ? "text-landing-text-200" : "text-landing-text-400"
              )}
            >
              {priceSuffix}
            </span>
          )}
        </div>
      </div>
      <div className="grow space-y-3">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start gap-3">
            {feature.value === "—" ? (
              <Minus
                className={cn(
                  "mt-0.5 shrink-0",
                  highlighted ? "text-landing-text-300" : "text-landing-text-600"
                )}
                size={16}
                strokeWidth={2}
              />
            ) : (
              <Check
                className={cn(
                  "mt-0.5 shrink-0",
                  highlighted ? "text-landing-text-100" : "text-landing-text-200"
                )}
                size={16}
                strokeWidth={3}
              />
            )}
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-sm",
                  feature.value === "—"
                    ? highlighted
                      ? "text-landing-text-400"
                      : "text-landing-text-600"
                    : highlighted
                      ? "text-landing-text-100"
                      : "text-landing-text-200"
                )}
              >
                {feature.label}
              </span>
              {feature.subtext && (
                <span
                  className={cn(
                    "text-xs mt-0.5",
                    highlighted ? "text-landing-text-300" : "text-landing-text-400"
                  )}
                >
                  {feature.subtext}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
