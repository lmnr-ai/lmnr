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

import { EvalColumnsMenuItem } from "./eval-columns-menu-item";

interface ColumnsListPanelProps {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnLabels: { id: string; label: string; onDelete?: () => void }[];
  lockedColumns: string[];
  onReorder: (newOrder: string[]) => void;
  onToggleVisibility: (columnId: string) => void;
  onReset: () => void;
  onCustomColumnClick: () => void;
  onEditColumn?: (columnId: string) => void;
}

export const ColumnsListPanel = ({
  columnOrder,
  columnVisibility,
  columnLabels,
  lockedColumns,
  onReorder,
  onToggleVisibility,
  onReset,
  onCustomColumnClick,
  onEditColumn,
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
      key="list"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="p-1 w-[250px]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
            {columnOrder.map((columnId) => {
              const labelEntry = columnLabels?.find((col) => col.id === columnId);
              return (
                <EvalColumnsMenuItem
                  key={columnId}
                  id={columnId}
                  label={labelEntry?.label || columnId}
                  isVisible={columnVisibility[columnId] !== false}
                  isLocked={lockedColumns.includes(columnId)}
                  onToggleVisibility={onToggleVisibility}
                  onDelete={labelEntry?.onDelete}
                  onEdit={columnId.startsWith("custom:") && onEditColumn ? () => onEditColumn(columnId) : undefined}
                />
              );
            })}
          </SortableContext>
        </DndContext>
        <div className="h-px bg-border my-1" />
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={onReset}
        >
          <ListRestart className="w-3.5 h-3.5 text-secondary-foreground mr-2" />
          Reset columns
        </div>
        <div
          className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={onCustomColumnClick}
        >
          <Plus className="w-3.5 h-3.5 text-secondary-foreground mr-2" />
          Custom column...
        </div>
      </div>
    </motion.div>
  );
};
