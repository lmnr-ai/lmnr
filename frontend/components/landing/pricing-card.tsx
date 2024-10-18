import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export interface PricingCardProps {
  className?: string;
  title: string;
  price: string;
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
        <h1 className="font-bold text-secondary-foreground text-2xl">
          {title}
        </h1>
        <h1 className="font-mono text-4xl text-white">{price}</h1>
      </div>
      <div className="flex-grow space-y-2">
        {features.map((feature, index) => (
          <div key={index} className="flex items-center">
            <Check className="mr-4" size={18} />
            <div className="flex flex-col">
              {feature}
              {subfeatures && subfeatures[index] && (
                <div className="text-sm text-secondary-foreground/60">
                  {subfeatures[index]}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}