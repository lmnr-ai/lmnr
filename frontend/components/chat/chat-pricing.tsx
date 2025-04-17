"use client";

import { useRouter } from "next/navigation";

import PricingCard from "@/components/landing/pricing-card";
import { Button } from "@/components/ui/button";

export default function ChatPricing() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center w-full h-full px-2 md:px-4">
      <div className="text-4xl font-semibold mt-4 md:mt-8">Upgrade your Plan</div>
      <span className="mt-4 text-secondary-foreground">Choose what&#39;s right for you</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8 p-4 md:p-8">
        <div className="p-4 md:p-8 border h-full w-full rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground w-full"
            title="Free"
            price={
              <>
                0$<span className="text-base text-secondary-foreground">/month</span>
              </>
            }
            features={[
              "10 messages / month",
              "Community support",
              "Parallel sessions",
              "Background Sessions",
              "Session Replay",
            ]}
            featureClassName="text-base"
          />

          <Button className="!mt-8 h-10 text-base w-full" variant="outline">
            Current plan
          </Button>
        </div>

        <div className="h-full w-full rounded p-4 md:p-8 flex flex-col z-20 bg-primary">
          <PricingCard
            className="text-white w-full"
            title="Pro"
            price={
              <>
                25$<span className="text-base">/month</span>
              </>
            }
            features={[
              "Unlimited messages",
              "Priority support",
              "Parallel sessions",
              "Background Sessions",
              "Session Replay",
            ]}
            featureClassName="text-base"
          />
          <Button
            className="h-10 mt-8 text-base bg-white/90 text-primary border-none hover:bg-white/70 w-full"
            variant="outline"
            onClick={() => router.push(`/checkout?type=user&lookupKey=index_pro_monthly_2025_04`)}
          >
            Upgrade
          </Button>
        </div>
      </div>
    </div>
  );
}
