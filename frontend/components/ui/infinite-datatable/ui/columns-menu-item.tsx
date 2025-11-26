import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";
import React from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";

interface ColumnsMenuItemProps {
  id: string;
  label: string;
  isVisible: boolean;
  isLocked: boolean;
  onToggleVisibility: (columnId: string) => void;
}

export const ColumnsMenuItem = ({ id, label, isVisible, isLocked, onToggleVisibility }: ColumnsMenuItemProps) => {
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

      <Switch
        className="ml-auto h-fit"
        checked={isVisible}
        disabled={isLocked}
        onCheckedChange={() => !isLocked && onToggleVisibility(id)}
        onClick={(e) => e.stopPropagation()}
      />
    </DropdownMenuItem>
  );
};
