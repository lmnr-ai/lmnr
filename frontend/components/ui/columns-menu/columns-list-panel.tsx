import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion } from "framer-motion";
import { ListRestart, Plus } from "lucide-react";
import React from "react";

import { ScrollArea } from "@/components/ui/scroll-area.tsx";

import { ColumnsMenuItem } from "./columns-menu-item";

interface ColumnsListPanelProps {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnLabelMap: Record<string, string>;
  lockedColumns: string[];
  onReorder: (newOrder: string[]) => void;
  onToggleVisibility: (columnId: string) => void;
  onReset: () => void;
  onCustomColumnClick?: () => void;
  onEditColumn?: (columnId: string) => void;
  onDeleteColumn?: (columnId: string) => void;
  showCreateButton?: boolean;
}

export const ColumnsListPanel = ({
  columnOrder,
  columnVisibility,
  columnLabelMap,
  lockedColumns,
  onReorder,
  onToggleVisibility,
  onReset,
  onCustomColumnClick,
  onEditColumn,
  onDeleteColumn,
  showCreateButton = false,
}: ColumnsListPanelProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (active && over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id);
      const newIndex = columnOrder.indexOf(over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(columnOrder, oldIndex, newIndex));
      }
    }
  }

  return (
    <motion.div
      className="w-64 overflow-hidden"
      key="list"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <ScrollArea type="always">
        <div className="max-h-[500px] pt-1 px-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
              {columnOrder.map((columnId) => {
                const isCustom = columnId.startsWith("custom:");
                return (
                  <ColumnsMenuItem
                    key={columnId}
                    id={columnId}
                    label={columnLabelMap[columnId] || columnId}
                    isVisible={columnVisibility[columnId] !== false}
                    isLocked={lockedColumns.includes(columnId)}
                    onToggleVisibility={onToggleVisibility}
                    onDelete={isCustom && onDeleteColumn ? () => onDeleteColumn(columnId) : undefined}
                    onEdit={isCustom && onEditColumn ? () => onEditColumn(columnId) : undefined}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>
      <div className="h-px bg-border my-1" />
      <div className="px-1 pb-1">
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={onReset}
        >
          <ListRestart className="w-3.5 h-3.5 text-secondary-foreground mr-2" />
          Reset columns
        </div>
        {showCreateButton && onCustomColumnClick && (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={onCustomColumnClick}
          >
            <Plus className="w-3.5 h-3.5 text-secondary-foreground mr-2" />
            Create column with SQL
          </div>
        )}
      </div>
    </motion.div>
  );
};
