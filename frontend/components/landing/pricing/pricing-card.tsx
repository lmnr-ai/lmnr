import { Check, X } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { microLabel } from "../class-names";
import LandingButton from "../landing-button";
import { type CardFeature } from "./tier-data";

export interface PricingCardProps {
  className?: string;
  title: string;
  price: string;
  priceSuffix?: string;
  features: CardFeature[];
  isAccent?: boolean;
  ctaLabel: string;
  ctaHref: string;
}

// One tier column. Surface-550 panel by default; the recommended tier switches
// to the orange fill via `isAccent`. Price is the dominant element; the tier name reads as
// a smaller label above. CTA sits at the bottom of the card.
export default function PricingCard({
  className,
  title,
  price,
  priceSuffix,
  features,
  isAccent = false,
  ctaLabel,
  ctaHref,
}: PricingCardProps) {
  const featureColor = isAccent ? "text-white" : "text-foreground-200";
  const suffixColor = isAccent ? "text-white/70" : "text-foreground-400";
  const checkColor = isAccent ? "text-white/80" : "text-foreground-300";

  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded h-full p-5",
        isAccent ? "bg-primary-400" : "bg-surface-450",
        className
      )}
    >
      <div className="flex flex-col gap-3">
        <p className={cn("text-lg text-white ")}>{title}</p>
        <p className="flex items-baseline gap-1">
          <span className="font-sans-landing font-medium text-3xl leading-none text-white tracking-[-0.02em]">
            {price}
          </span>
          {priceSuffix && <span className={cn("text-sm", suffixColor)}>{priceSuffix}</span>}
        </p>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {features.map((feature) => {
          const Icon = feature.excluded ? X : Check;
          return (
            <div key={feature.label} className="flex flex-col gap-0.5">
              <div className="flex items-start gap-1.5">
                <Icon className={cn("size-3.5 mt-1 shrink-0", checkColor)} strokeWidth={2.5} />
                <p className={cn("text-base leading-6", feature.excluded ? suffixColor : featureColor)}>
                  {feature.label}
                </p>
              </div>
              {feature.subfeature && (
                <p className={cn(microLabel, "text-sm ml-[20px]", isAccent && "text-white/70")}>{feature.subfeature}</p>
              )}
            </div>
          );
        })}
      </div>
      <Link href={ctaHref} className="w-full">
        <LandingButton
          variant={isAccent ? "solid" : "outline"}
          size="sm"
          className={cn(
            "h-10 w-full md:h-auto",
            isAccent && "bg-white text-primary-400 border border-white/40 hover:bg-white/90"
          )}
        >
          {ctaLabel}
        </LandingButton>
      </Link>
    </div>
  );
}
