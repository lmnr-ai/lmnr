import { Check } from "lucide-react";
import Link from "next/link";
import React from "react";

import { cn } from "@/lib/utils";

import { microLabel, subSection } from "../class-names";
import LandingButton from "../landing-button";

export interface PricingCardProps {
  className?: string;
  title: string;
  price: string | React.ReactNode;
  features: string[];
  subfeatures?: (string | null)[];
  isAccent?: boolean;
  ctaLabel: string;
  ctaHref: string;
}

// One tier column. Surface-550 panel by default; Pro switches to the orange
// fill via `isAccent`. CTA sits at the bottom of the card.
export default function PricingCard({
  className,
  title,
  price,
  features,
  subfeatures,
  isAccent = false,
  ctaLabel,
  ctaHref,
}: PricingCardProps) {
  const featureColor = isAccent ? "text-white" : "text-landing-text-200";
  const subfeatureColor = isAccent ? "text-white/70" : "text-landing-text-400";
  const checkColor = isAccent ? "text-white/80" : "text-landing-text-300";

  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded h-full p-5",
        isAccent ? "bg-landing-primary-400" : "bg-landing-surface-550",
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <p className={cn(subSection, "text-white")}>{title}</p>
        <p className={cn("font-sans text-sm", subfeatureColor)}>{price}</p>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {features.map((feature, index) => (
          <div key={index} className="flex flex-col gap-0.5">
            <div className="flex items-start gap-1.5">
              <Check className={cn("size-3 mt-1 shrink-0", checkColor)} strokeWidth={2.5} />
              <p className={cn("text-sm leading-5", featureColor)}>{feature}</p>
            </div>
            {subfeatures && subfeatures[index] && (
              <p className={cn(microLabel, "ml-[18px]", isAccent && "text-white/70")}>{subfeatures[index]}</p>
            )}
          </div>
        ))}
      </div>
      <Link href={ctaHref} className="w-full">
        <LandingButton
          variant={isAccent ? "primary" : "outline"}
          size="sm"
          className={cn("w-full", isAccent && "bg-white text-landing-primary-400 border-white/40 hover:bg-white/90")}
        >
          {ctaLabel}
        </LandingButton>
      </Link>
    </div>
  );
}
