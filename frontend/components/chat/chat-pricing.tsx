'use client';

'use client';

import Image from 'next/image';
import Link from 'next/link';

import noise from '@/assets/landing/noise1.jpeg';
import { Button } from '@/components/ui/button';

import PricingCard from '@/components/landing/pricing-card';
import { useRouter } from 'next/navigation';

interface ChatPricingProps {
  userTier: string
  userId: string
}

export default function ChatPricing({ userTier, userId }: ChatPricingProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center mt-32 w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:p-16">
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
          <Link href="/chat">
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
        <div
          className="rounded relative"
        >
          <div className="absolute inset-0 z-10 overflow-hidden rounded-lg">
            <Image
              src={noise}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div className="bg-transparent h-full w-full rounded p-8 flex flex-col z-20">
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
              <Link href="/projects" className="w-full z-20">
                {userTier.trim().toLowerCase() === 'free' ?
                  <Button
                    className="h-10 text-base bg-white/90 text-black hover:bg-white/70 w-full"
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/checkout?type=user&userId=${userId}&lookupKey=index_pro_monthly_2025_04`
                      )
                    }
                  >
                    Upgrade
                  </Button>
                  :
                  <Button
                    variant="secondary"
                    className="w-full h-10"
                    onClick={() =>
                      router.push(
                        `/checkout/portal?type=user&userId=${userId}&callbackUrl=/chat/pricing`
                      )
                    }
                  >
                    Manage billing
                  </Button>
                }
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div >
  );
}
