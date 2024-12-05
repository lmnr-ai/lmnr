import { Check } from 'lucide-react';
import React from 'react';

import { cn } from '@/lib/utils';

export interface PricingCardProps {
  className?: string;
  title: string;
  price: string | React.ReactNode;
  features: string[];
  subfeatures?: (string | null)[];
}

export default function PricingCard({
  className,
  title,
  features,
  subfeatures,
  price
}: PricingCardProps) {
  return (
    <div className={cn(className, 'flex flex-col space-y-4 text-base py-4')}>
      <div className="flex-shrink space-y-2">
        <h1 className="font-medium text-2xl">
          {title}
        </h1>
        <h1 className="font-mono text-4xl text-white">{price}</h1>
      </div>
      <div className="flex-grow space-y-2">
        {features.map((feature, index) => (
          <div key={index}>
            <div key={index} className="flex items-center">
              <Check className="mr-4" size={18} strokeWidth={3} />
              <div className="flex flex-col text-lg">
                {feature}
              </div>
            </div>
            {subfeatures && subfeatures[index] && (
              <div className="text-sm ml-9">
                {subfeatures[index]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
