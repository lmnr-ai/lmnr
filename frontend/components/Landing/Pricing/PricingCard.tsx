import { Check } from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";

export interface PricingCardProps {
  className?: string;
  title: string;
  price: string | React.ReactNode;
  features: string[];
  subfeatures?: (string | null)[];
  featureClassName?: string;
  titleClassName?: string;
  subfeatureClassName?: string;
}

export default function PricingCard({
  className,
  title,
  features,
  subfeatures,
  price,
  featureClassName,
  titleClassName,
  subfeatureClassName,
}: PricingCardProps) {
  return (
    <div className={cn(className, "flex flex-col space-y-4 text-base py-4")}>
      <div className="shrink space-y-2">
        <h1 className={cn("text-2xl font-space-grotesk", titleClassName)}>{title}</h1>
        <h1 className="text-4xl font-space-grotesk text-landing-text-100 font-semibold tracking-tight">{price}</h1>
      </div>
      <div className="grow space-y-2">
        {features.map((feature, index) => (
          <div key={index}>
            <div className="flex items-center">
              <Check className="mr-4" size={16} strokeWidth={3} />
              <div className={cn("flex flex-col text-landing-text-100", featureClassName)}>{feature}</div>
            </div>
            {subfeatures && subfeatures[index] && (
              <div className={cn("ml-8 text-landing-text-300", subfeatureClassName)}>{subfeatures[index]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
