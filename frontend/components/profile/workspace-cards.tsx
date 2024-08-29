import { UserStats } from "@/lib/profile/types";
import { Workspace } from "@/lib/workspaces/types";
import WorkspaceUsage from "./workspace-usage";

interface WorkspaceCardsProps {
  workspaces: Workspace[];
  userStats: UserStats;
}

export default function WorkspaceCards({ workspaces, userStats }: WorkspaceCardsProps) {
  return (
    <div className="flex flex-col space-y-2 mt-8">
      <div>Workspaces Usage</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {workspaces.map(workspace => (
          <WorkspaceUsage key={workspace.id} workspace={workspace} userStats={userStats} />
        ))}
      </div>
    </div>
  )
}