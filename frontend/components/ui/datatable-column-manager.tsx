import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, Settings } from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

interface DataTableColumnManagerProps<TData = any> {
  // Add props
}

interface SortableColumnItemProps<TData = any> {
  id: string;
  // Add props
}

function SortableColumnItem<TData = any>({ id }: SortableColumnItemProps<TData>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      style={style}
      className={cn(
        "flex items-center justify-between px-3 py-2 text-sm border-b border-border/50 last:border-b-0 hover:bg-muted/50 transition-colors",
        isDragging && "bg-muted/50 shadow-sm z-10 opacity-90"
      )}
    >
      <div className="flex items-center space-x-3 flex-1">
        <Checkbox className="shrink-0" />
        <span className="flex-1 truncate select-none"></span>
      </div>

      <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted/70 rounded shrink-0">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export function DataTableColumnManager<TData = any>({}: DataTableColumnManagerProps<TData>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-secondary-foreground">
          <Settings className="mr-2 h-[14px] w-[14px]" />
          Columns
          <ChevronDown className="ml-1 h-[14px] w-[14px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Manage columns</DropdownMenuLabel>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
            Reset order
          </Button>
        </div>
        <DropdownMenuSeparator />

        <div className="text-xs text-muted-foreground px-3 py-1">Click to toggle visibility • Drag to reorder</div>

        <div className="max-h-64 overflow-y-auto overflow-x-hidden relative"></div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
