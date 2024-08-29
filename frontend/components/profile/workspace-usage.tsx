import { UserStats, WorkspaceStats } from "@/lib/profile/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";
import { Workspace } from "@/lib/workspaces/types";
import useSWR from "swr";
import { Skeleton } from "../ui/skeleton";
import { Progress } from "../ui/progress";
import { Label } from "@radix-ui/react-label";

interface WorkspaceUsageProps {
  userStats: UserStats;
  workspace: Workspace;
}

export default function WorkspaceUsage({ userStats, workspace }: WorkspaceUsageProps) {
  const { data: workspaceStats, isLoading }: { data: WorkspaceStats, isLoading: boolean } = useSWR(`/api/limits/workspace/${workspace.id}`, swrFetcher);

  if (isLoading) {
    return <Skeleton className="shadow-md rounded-lg p-4 md:w-1/3 sm:w-full flex flex-col space-y-8" />
  }

  const runs = workspaceStats?.runsThisMonth ?? 0;
  const runLimit = userStats?.runsLimitPerWorkspace ?? 1000;
  const codegenLimits = userStats?.codegensLimitPerWorkspace ?? 0;
  // this is incremented prior to the codegen being run in the back-end so choose the minimum of the two,
  // so the UI doesn't show a higher number than the actual limit
  const codegens = Math.min(workspaceStats?.codegensThisMonth ?? 0, codegenLimits);

  const nextResetTime = workspaceStats?.runsNextResetTime ? formatTimestamp(workspaceStats.runsNextResetTime) : "--";
  const members = workspaceStats?.membersCount ?? 0;
  const projects = workspaceStats?.projectsCount ?? 0;
  const membersPerWorkspaceLimit =
    (userStats?.membersPerWorkspace ?? 1) + (userStats?.additionalSeats ?? 0);

  return (
    <div className="shadow-md rounded-lg p-4 flex flex-col space-y-2 border">
      <div>{workspace.name}</div>
      <div className="flex flex-col space-y-2 ">
        <Label className="mt-2">Pipeline runs</Label>
        <div className="flex flex-row space-x-2 ">
          <div className="text-sm text-secondary-foreground flex-grow">{runs} / {runLimit}</div>
          <div className="text-sm text-secondary-foreground"> Resets on {nextResetTime} </div>
        </div>
        <Progress
          value={Math.min(runs / runLimit * 100, 100)}
          className="text-foreground h-1" />
      </div>

      {userStats?.codegensLimitPerWorkspace > 0 && (
        <div className="flex flex-col space-y-2 ">
          <Label className="mt-2">Code generations</Label>
          <div className="flex flex-row space-x-2 ">
            <div className="text-sm text-secondary-foreground flex-grow">{codegens} / {codegenLimits}</div>
            <div className="text-sm text-secondary-foreground"> Resets on {nextResetTime} </div>
          </div>
          <Progress
            value={Math.min(codegens / codegenLimits * 100, 100)}
            className="text-foreground h-1" />
        </div>
      )}

      <div className="flex flex-col space-y-2">
        <Label className="mt-2">Members</Label>
        <div className="flex flex-row space-x-2">
          <div className="text-sm text-secondary-foreground">{members} / {membersPerWorkspaceLimit}</div>
        </div>
        <Progress
          value={Math.min(members / membersPerWorkspaceLimit * 100, 100)}
          className="text-foreground h-1"
        />
      </div>
      <div className="flex flex-col space-y-2">
        <Label className="mt-2">Projects</Label>
        <div className="flex flex-row space-x-2 ">
          <div className="text-sm text-secondary-foreground">{projects}</div>
        </div>
      </div>
    </div >
  )
}