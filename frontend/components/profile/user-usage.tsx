import { StorageStats, UserStats } from "@/lib/profile/types";
import { Progress } from "../ui/progress";
import { formatTimestamp, swrFetcher } from "@/lib/utils";
import useSWR from "swr";

interface UserUsageProps {
  stats: UserStats;
}

export default function UserUsage({ stats }: UserUsageProps) {
  const runs = stats?.runsThisMonth ?? 0;
  const runLimit = stats?.runsLimit ?? 1000;
  const nextResetTime = stats?.runsNextResetTime ? formatTimestamp(stats?.runsNextResetTime) : "--";
  const workspaces = stats?.numWorkspaces ?? 0;
  const workspaceLimit = stats?.workspacesLimit ?? 1;

  const { data: storageStats }: { data: StorageStats } = useSWR('/api/limits/user/storage', swrFetcher);

  const storageMiB = storageStats?.storageMib ?? 0;
  const storageMiBLimit = stats?.storageMibLimit ?? 10;

  return (
    <div className="shadow-md rounded-lg p-4 md:w-1/3 sm:w-full flex flex-col space-y-4 border">
      <div className="flex flex-col space-y-2">
        <div className="mt-2">Pipeline runs</div>
        <div className="flex flex-row space-x-2 ">
          <div className="text-sm flex-grow text-secondary-foreground">{runs} / {runLimit}</div>
          <div className="text-sm text-secondary-foreground"> Resets on {nextResetTime} </div>
        </div>
        <Progress
          value={Math.min(runs / runLimit * 100, 100)}
          className="text-foreground h-1" />
      </div>
      <div className="flex flex-col space-y-2">
        <div className="mt-2">Workspaces</div>
        <div className="flex flex-row space-x-2 ">
          <div className="text-sm text-secondary-foreground">{workspaces} / {workspaceLimit}</div>
        </div>
        <Progress
          value={Math.min(workspaces / workspaceLimit * 100, 100)}
          className="text-foreground h-1" />
      </div>
      <div className="flex flex-col space-y-2">
        <div className="mt-2">Storage</div>
        <div className="flex flex-row space-x-2 ">
          <div className="text-sm text-secondary-foreground">{storageMiB.toFixed(2)} MB / {storageMiBLimit} MB</div>
        </div>
        <Progress
          value={Math.min(storageMiB / storageMiBLimit * 100, 100)}
          className="text-foreground h-1" />
      </div>
    </div>
  )
}
