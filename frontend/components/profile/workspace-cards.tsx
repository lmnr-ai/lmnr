import { Workspace } from "@/lib/workspaces/types";

interface WorkspaceCardsProps {
  workspaces: Workspace[];
}

export default function WorkspaceCards({ workspaces, }: WorkspaceCardsProps) {
  return (
    <div className="flex flex-col space-y-2 mt-8">
      <div>Workspaces Usage</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      </div>
    </div>
  )
}