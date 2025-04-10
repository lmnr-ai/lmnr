'use client';

import { useRouter } from 'next/navigation';
import PricingCard from '@/components/landing/pricing-card';
import { Button } from '@/components/ui/button';

export default function ChatPricing() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center w-full h-full">
      <div className="text-4xl font-semibold mt-16">
        Upgrade your plan
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 md:p-16">
        <div className="p-8 border rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Free"
            price="0 / month"
            features={[
              '10 messages / month',
              'Community support'
            ]}
          />
        </div>

        <div className="h-full w-full rounded p-8 flex flex-col z-20 bg-primary">
          <PricingCard
            className="text-white z-20"
            title="Pro"
            price={`$25 / month`}
            features={[
              'Unlimited messages',
              'Priority support'
            ]}
          />
          <div className="space-y-4 z-20 flex flex-col">
            <Button
              className="h-10 text-base bg-white/90 text-primary border-none hover:bg-white/70 w-full"
              variant="outline"
              onClick={() =>
                router.push(
                  `/checkout?type=user&lookupKey=index_pro_monthly_2025_04`
                )
              }
            >
              Upgrade
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
