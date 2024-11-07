import { WorkspaceStats } from '@/lib/usage/types';
import { Workspace } from '@/lib/workspaces/types';
import { Progress } from '../ui/progress';
import { Label } from '@radix-ui/react-label';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import PurchaseSeatsDialog from './purchase-seats-dialog';

interface WorkspaceUsageProps {
  workspace: Workspace;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
}

export default function WorkspaceUsage({
  workspace,
  workspaceStats,
  isOwner
}: WorkspaceUsageProps) {
  const router = useRouter();

  const members = workspaceStats?.members ?? 0;
  const membersLimit = workspaceStats?.membersLimit ?? 1;
  const spansThisMonth = workspaceStats?.spansThisMonth ?? 0;
  const spansLimit = workspaceStats?.spansLimit ?? 1;
  const seatsIncludedInTier = workspaceStats?.seatsIncludedInTier ?? 1;

  const tierName = workspaceStats.tierName;
  const resetTime = workspaceStats.resetTime;

  return (
    <div className="p-4 flex flex-col space-y-2">
      <div className="">{tierName} tier workspace</div>
      <div className="text-sm text-secondary-foreground">
        Monthly billing cycle started{' '}
        <ClientTimestampFormatter timestamp={resetTime} />
      </div>

      <div className="flex flex-row space-x-2">
        <div>
          {isOwner &&
            (workspaceStats.tierName === 'Free' ? (
              <Button
                variant="default"
                onClick={() =>
                  router.push(
                    `/checkout?workspaceId=${workspace.id}&workspaceName=${workspace.name}`
                  )
                }
              >
                Upgrade
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/checkout/portal?callbackUrl=/workspace/${workspace.id}`
                  )
                }
              >
                Manage billing
              </Button>
            ))}
        </div>
        <div>
          {isOwner && workspaceStats.tierName !== 'Free' && (
            <PurchaseSeatsDialog
              workspaceId={workspace.id}
              currentQuantity={membersLimit}
              seatsIncludedInTier={seatsIncludedInTier}
              onUpdate={() => {
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col space-y-1">
        <Label className="mt-2 text-secondary-foreground text-sm">Spans</Label>
        {spansThisMonth <= spansLimit ? (
          <>
            <div className="flex flex-row space-x-2">
              <div className="flex-grow">
                {spansThisMonth} / {spansLimit}
              </div>
              {/* <div className=""> All time {workspaceStats.totalSpans} </div> */}
            </div>
          </>
        ) : (
          <div className="flex flex-row space-x-2 ">
            <div className="flex-grow">{spansThisMonth} </div>
            {/* <div className="text-sm text-secondary-foreground">
              {' '}
              All time {workspaceStats.totalSpans}{' '}
            </div> */}
          </div>
        )}
      </div>

      <div className="flex flex-col space-y-1">
        <Label className="mt-2 text-secondary-foreground text-sm">
          Members
        </Label>
        <div className="flex flex-row space-x-2">
          <div className="">
            {members} / {membersLimit}
          </div>
        </div>
      </div>
    </div>
  );
}
