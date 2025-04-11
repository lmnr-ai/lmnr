import Link from 'next/link';

import { Button } from '@/components/ui/button';

import PricingCard from '../landing/pricing-card';

const TIER_LINKS = {
  free: '/projects',
  hobby: '/checkout?type=workspace&lookupKey=hobby_monthly_2025_04',
  pro: '/checkout?type=workspace&lookupKey=pro_monthly_2025_04',
};

interface PricingDialogProps {
  workspaceTier: string;
  workspaceId: string;
  workspaceName: string;
}

const isTierPaid = (tier: string) => tier.toLowerCase().trim() !== 'free';

export default function PricingDialog({ workspaceTier, workspaceId, workspaceName }: PricingDialogProps) {
  const addWorkspaceToLink = (link: string) => `${link}&workspaceId=${workspaceId}&workspaceName=${workspaceName}`;

  return (
    <div className="flex flex-col items-center w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:p-16">
        <div className="p-8 border rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Free"
            price="0 / month"
            features={[
              '50K spans / month',
              '15 day data retention',
              '1 team member',
              '100 agent steps / month',
              'Community support',
            ]}
          />
          <Link href={TIER_LINKS.free}>
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
        <div className="p-8 border rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Hobby"
            price="$25 / month"
            features={[
              '100k spans / month',
              '30 day data retention',
              '2 team members',
              '1000 agent steps / month',
              'Community support',
            ]}
            subfeatures={[
              'then $5 per 100k of additional spans',
              null,
              null
            ]}
          />
          <Link href={workspaceTier === 'hobby' ? '/checkout/portal' : addWorkspaceToLink(TIER_LINKS.hobby)}>
            <Button variant="secondary" className="w-full h-10">
              {workspaceTier === 'hobby' ? 'Manage billing' : 'Get started'}
            </Button>
          </Link>
        </div>
        <div className="h-full w-full rounded p-8 flex flex-col z-20 border border-primary bg-primary">
          <PricingCard
            className="text-white z-20"
            title="Pro"
            price={'$50 / month'}
            features={[
              '200k spans / month included',
              '90 day data retention',
              '3 team members included',
              '3000 agent steps / month',
              'Private Slack channel',
            ]}
            subfeatures={[
              'then $5 per 100k of additional spans',
              null,
              '$25 per additional team member',
              null
            ]}
          />
          <div className="space-y-4 z-20 flex flex-col">
            <Link href={isTierPaid(workspaceTier) ? '/checkout/portal' : addWorkspaceToLink(TIER_LINKS.pro)} className="w-full z-20">
              <Button
                className="h-10 text-base bg-white/90 border-none text-primary hover:bg-white/70 w-full"
                variant="outline"
              >
                {isTierPaid(workspaceTier) ?
                  (workspaceTier === 'hobby' ? 'Upgrade' : 'Manage billing')
                  : 'Get started'}
              </Button>
            </Link>
          </div>
        </div>
      </div>
      <div className="flex-grow"></div>
    </div >
  );
}
