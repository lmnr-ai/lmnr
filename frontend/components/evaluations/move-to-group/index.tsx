"use client";

import { FolderInput, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import CreateGroupDialog from "./create-group-dialog";

interface MoveToGroupProps {
  projectId: string;
  selectedRowIds: string[];
  /** The group the selected runs are currently in — hidden from the destination list. */
  currentGroupId: string | null;
  /** All groups in the project (from the shared evaluation-groups SWR). */
  groups: { groupId: string }[];
  /** Fired after a successful move with the destination group id: parent navigates
   * to it, clears selection, and revalidates the groups list. */
  onMoved: (destinationGroupId: string) => void;
}

export default function MoveToGroup({ projectId, selectedRowIds, currentGroupId, groups, onMoved }: MoveToGroupProps) {
  const { toast } = useToast();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const destinationGroups = groups.filter((g) => g.groupId !== currentGroupId);
  const existingNames = groups.map((g) => g.groupId);

  const move = async (groupId: string) => {
    setIsMoving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/evaluations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationIds: selectedRowIds, groupId }),
      });

      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to move evaluations" });
        return;
      }

      toast({
        title: "Evaluations moved",
        description: `Moved ${selectedRowIds.length} run${selectedRowIds.length === 1 ? "" : "s"} to "${groupId}".`,
      });
      setPopoverOpen(false);
      setDialogOpen(false);
      onMoved(groupId);
    } catch {
      toast({ variant: "destructive", title: "Failed to move evaluations" });
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" aria-label="Move to group">
            <FolderInput size={12} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-64 p-1">
          <div className="max-h-64 overflow-y-auto">
            {destinationGroups.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">No other groups to move to</div>
            ) : (
              destinationGroups.map((g) => (
                <button
                  key={g.groupId}
                  type="button"
                  disabled={isMoving}
                  onClick={() => move(g.groupId)}
                  className={cn(
                    "flex w-full min-w-0 items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    "hover:bg-surface-700 active:bg-surface-600 disabled:pointer-events-none disabled:opacity-50"
                  )}
                >
                  <span className="min-w-0 truncate">{g.groupId}</span>
                </button>
              ))
            )}
          </div>
          <div className="mt-1 border-t pt-1">
            <button
              type="button"
              disabled={isMoving}
              onClick={() => setDialogOpen(true)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                "hover:bg-surface-700 active:bg-surface-600 disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              <Plus size={14} />
              <span>Create new group</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <CreateGroupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingNames={existingNames}
        count={selectedRowIds.length}
        isMoving={isMoving}
        onConfirm={move}
      />
    </>
  );
}
