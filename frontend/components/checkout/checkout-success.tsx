'use client';

import Link from 'next/link';

import { LOOKUP_KEY_TO_TIER_NAME } from '@/lib/checkout/utils';

import { Button } from '../ui/button';
import { Label } from '../ui/label';

export interface CheckoutSuccessProps {
  sessionId: string;
  lookupKey: string;
  workspaceId: string;
  workspaceName: string;
}

export default function CheckoutSuccess({
  sessionId,
  lookupKey,
  workspaceId,
  workspaceName
}: CheckoutSuccessProps) {
  const tierName = LOOKUP_KEY_TO_TIER_NAME?.[lookupKey];

  return (
    <div className="flex flex-col z-10">
      <div className="flex flex-col items-center justify-center">
        <div className="px-8 space-y-4 md:w-[1000px] flex flex-col md:border-4 md:pl-16 py-32 mt-96">
          <Label className="text-lg font-bold">
            {`Congrats, your subscription ${tierName ? 'for ' + tierName + ' ' : ''} for ${workspaceName} was successful!`}
          </Label>
          <Link href="/projects">
            <Button>Go to dashboard</Button>
          </Link>
          <Link href={`/workspace/${workspaceId}`}>
            <Button variant="secondary">Go to workspace</Button>
          </Link>
          <Link href={`/checkout/portal?sessionId=${sessionId}`}>
            <Button variant="secondary"> Manage your billing </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
