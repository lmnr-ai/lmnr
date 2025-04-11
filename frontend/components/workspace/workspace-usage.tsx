import { Label } from '@radix-ui/react-label';
import { useRouter } from 'next/navigation';

import { WorkspaceStats } from '@/lib/usage/types';
import { cn } from '@/lib/utils';
import { Workspace } from '@/lib/workspaces/types';

import ClientTimestampFormatter from '../client-timestamp-formatter';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../ui/dialog';
import PricingDialog from './pricing-dialog';

interface WorkspaceUsageProps {
  workspace: Workspace;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
}

const TIER_SPAN_HINTS = {
  free: {
    spans: '50k',
    steps: '100',
    isOverageAllowed: false,
  },
  hobby: {
    spans: '100k',
    steps: '1000',
    isOverageAllowed: true,
  },
  pro: {
    spans: '200k',
    steps: '3000',
    isOverageAllowed: true,
  },
};

export default function WorkspaceUsage({
  workspace,
  workspaceStats,
  isOwner
}: WorkspaceUsageProps) {
  const router = useRouter();

  const spansThisMonth = workspaceStats?.spansThisMonth ?? 0;
  const spansLimit = workspaceStats?.spansLimit ?? 1;
  const resetTime = workspaceStats.resetTime;

  const tierHintInfo = TIER_SPAN_HINTS[workspaceStats.tierName.toLowerCase().trim() as keyof typeof TIER_SPAN_HINTS];
  const tierHint = `${workspaceStats.tierName} tier comes with ${tierHintInfo.spans} spans and ` +
    `${tierHintInfo.steps} agent steps included per month.`;

  const tierHintOverages = 'If you exceed this limit, '
    + (tierHintInfo.isOverageAllowed
      ? 'you will be charged for overages.'
      : 'you won\'t be able to send any more spans during current billing cycle.');

  return (
    <div className="p-4 flex flex-col space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn("text-xs text-secondary-foreground p-0.5 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20", workspace.tierName === 'Pro' && 'border-primary bg-primary/10 text-primary')}>
          {workspace.tierName}
        </div>
      </div>
      <div className="text-sm text-secondary-foreground">
        Monthly billing cycle started{' '}
        <ClientTimestampFormatter timestamp={resetTime} />
      </div>

      <div className="flex flex-row space-x-2">
        <div>
          {isOwner &&
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">
                  {workspaceStats.tierName.toLowerCase().trim() === 'free'
                    ? 'Upgrade'
                    : 'Manage billing'
                  }
                </Button>
              </DialogTrigger>
              <DialogTitle className="hidden">Manage billing</DialogTitle>
              <DialogContent className="max-w-[80vw] min-h-[80vh]">
                <PricingDialog
                  workspaceTier={workspaceStats.tierName}
                  workspaceId={workspace.id}
                  workspaceName={workspace.name}
                />
              </DialogContent>
            </Dialog>
          }
        </div>
      </div>

      <div className="flex flex-col space-y-1">
        <p className="text-secondary-foreground text-sm mb-2">
          {tierHint} <br />
          {tierHintOverages}
        </p>

        <Label className="mt-2 text-secondary-foreground text-sm">
          Spans used during this billing cycle
        </Label>
        {workspaceStats.tierName === 'Free' ? (
          <>
            <div className="flex flex-row space-x-2">
              <div className="flex-grow">
                {spansThisMonth} / {spansLimit}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-row space-x-2 ">
            <div className="flex-grow">{spansThisMonth} </div>
          </div>
        )}
      </div>
    </div>
  );
}
