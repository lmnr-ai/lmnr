import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal, Trash2 } from "lucide-react";
import React from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";

interface EvalColumnsMenuItemProps {
  id: string;
  label: string;
  isVisible: boolean;
  isLocked: boolean;
  onToggleVisibility: (columnId: string) => void;
  onDelete?: () => void;
}

export const EvalColumnsMenuItem = ({
  id,
  label,
  isVisible,
  isLocked,
  onToggleVisibility,
  onDelete,
}: EvalColumnsMenuItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    disabled: isLocked,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <DropdownMenuItem style={style} className={cn("flex items-center gap-4", isLocked && "hidden")}>
      <div className="flex items-center gap-2">
        <div
          ref={setNodeRef}
          {...(!isLocked && { ...attributes, ...listeners })}
          className={cn("cursor-grab", isLocked && "cursor-not-allowed opacity-50")}
        >
          <GripHorizontal />
        </div>
        <span className={isLocked ? "text-muted-foreground mr-4" : ""}>{label}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {onDelete && (
          <button
            className="text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <Switch
          className="h-fit"
          checked={isVisible}
          disabled={isLocked}
          onCheckedChange={() => !isLocked && onToggleVisibility(id)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </DropdownMenuItem>
  );
};
