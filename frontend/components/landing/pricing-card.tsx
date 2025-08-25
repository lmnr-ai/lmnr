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
  subfeatureClassName?: string;
}

export default function PricingCard({
  className,
  title,
  features,
  subfeatures,
  price,
  featureClassName,
  subfeatureClassName,
}: PricingCardProps) {
  return (
    <div className={cn(className, "flex flex-col space-y-4 text-base py-4 font-title font-semibold")}>
      <div className="flex-shrink space-y-2">
        <h1 className="text-2xl">{title}</h1>
        <h1 className="text-4xl text-white">{price}</h1>
      </div>
      <div className="flex-grow space-y-2">
        {features.map((feature, index) => (
          <div key={index}>
            <div key={index} className="flex items-center">
              <Check className="mr-4" size={16} strokeWidth={3} />
              <div className={cn("flex flex-col text-white", featureClassName)}>{feature}</div>
            </div>
            {subfeatures && subfeatures[index] && (
              <div className={cn("text-sm ml-8", subfeatureClassName)}>{subfeatures[index]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
