import { FolderInput } from "lucide-react";

import { useMoveChart } from "@/components/dashboards/use-move-chart";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

interface MoveChartSubmenuProps {
  id: string;
  projectId: string;
  dashboardId: string;
}

/** "Move to" submenu listing the project's other dashboards. */
const MoveChartSubmenu = ({ id, projectId, dashboardId }: MoveChartSubmenuProps) => {
  const { dashboards, moveChart } = useMoveChart(projectId, dashboardId);
  const targets = dashboards.filter((dashboard) => dashboard.id !== dashboardId);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer" onClick={(e) => e.stopPropagation()}>
        <FolderInput className="size-3.5" />
        Move to
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-48 overflow-y-auto">
        {targets.length === 0 ? (
          <DropdownMenuItem disabled>No other dashboards</DropdownMenuItem>
        ) : (
          targets.map((target) => (
            <DropdownMenuItem
              key={target.id}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                moveChart(id, target.id);
              }}
            >
              <span className="truncate">{target.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};

export default MoveChartSubmenu;
