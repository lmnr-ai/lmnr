import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";
import React from "react";

import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.ts";

interface ColumnsMenuItemProps {
  id: string;
  isVisible: boolean;
  isLocked: boolean;
  onToggleVisibility: (columnId: string) => void;
}

export const ColumnsMenuItem = ({ id, isVisible, isLocked, onToggleVisibility }: ColumnsMenuItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    disabled: isLocked,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <DropdownMenuItem style={style}>
      <Checkbox
        className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
        checked={isVisible}
        disabled={isLocked}
        onCheckedChange={() => !isLocked && onToggleVisibility(id)}
        onClick={(e) => e.stopPropagation()}
      />
      <span className={isLocked ? "text-muted-foreground" : ""}>{id}</span>
      <div
        ref={setNodeRef}
        {...(!isLocked && { ...attributes, ...listeners })}
        className={cn("ml-auto cursor-grab", isLocked && "cursor-not-allowed opacity-50")}
      >
        <GripHorizontal />
      </div>
    </DropdownMenuItem>
  );
};
