import { WorkspaceStats } from '@/lib/usage/types';
import { swrFetcher } from '@/lib/utils';
import { Workspace } from '@/lib/workspaces/types';
import useSWR from 'swr';
import { Skeleton } from '../ui/skeleton';
import { Progress } from '../ui/progress';
import { Label } from '@radix-ui/react-label';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';

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
  const eventsThisMonth = workspaceStats?.eventsThisMonth ?? 0;
  const eventsLimit = workspaceStats?.eventsLimit ?? 1;

  const tierName = workspaceStats.tierName;
  const resetTime = workspaceStats.resetTime;

  return (
    <div className="p-4 flex flex-col space-y-2">
      <div className="">{tierName} tier workspace</div>
      <div className="text-sm text-secondary-foreground">
        Monthly billing cycle started{' '}
        <ClientTimestampFormatter timestamp={resetTime} />
      </div>

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

      <div className="flex flex-col space-y-1">
        <Label className="mt-2 text-secondary-foreground text-sm">Spans</Label>
        {spansThisMonth <= spansLimit ? (
          <>
            <div className="flex flex-row space-x-2">
              <div className="flex-grow">
                {spansThisMonth} / {spansLimit}
              </div>
              <div className=""> All time {workspaceStats.totalSpans} </div>
            </div>
            <Progress
              value={Math.min((spansThisMonth / spansLimit) * 100, 100)}
              className="text-foreground h-1"
            />
          </>
        ) : (
          <div className="flex flex-row space-x-2 ">
            <div className="flex-grow">{spansThisMonth} </div>
            <div className="text-sm text-secondary-foreground">
              {' '}
              All time {workspaceStats.totalSpans}{' '}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col space-y-1">
        <Label className="mt-2 text-secondary-foreground text-sm">Events</Label>
        {spansThisMonth <= spansLimit ? (
          <>
            <div className="flex flex-row space-x-2 ">
              <div className="flex-grow">
                {eventsThisMonth} / {eventsLimit}
              </div>
              <div className=""> All time {workspaceStats.totalEvents} </div>
            </div>
            <Progress
              value={Math.min((eventsThisMonth / eventsLimit) * 100, 100)}
              className="text-foreground h-1"
            />
          </>
        ) : (
          <div className="flex flex-row space-x-2 ">
            <div className="flex-grow">{eventsThisMonth} </div>
            <div className="text-sm text-secondary-foreground">
              {' '}
              All time {workspaceStats.totalEvents}{' '}
            </div>
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
        <Progress
          value={Math.min((members / membersLimit) * 100, 100)}
          className="text-foreground h-1"
        />
      </div>
    </div>
  );
}
