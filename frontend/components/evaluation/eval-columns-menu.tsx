import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DropdownMenuSeparator } from "@radix-ui/react-dropdown-menu";
import { ListRestart, Plus } from "lucide-react";
import React, { useState } from "react";
import { useStore } from "zustand";

import AddCustomColumnDialog from "@/components/evaluation/add-custom-column-dialog";
import { type CustomColumn, useEvalStore } from "@/components/evaluation/store";
import { EvalColumnsMenuItem } from "@/components/evaluation/eval-columns-menu-item";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";

interface EvalColumnsMenuProps {
  lockedColumns?: string[];
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
}

export default function EvalColumnsMenu({ lockedColumns = [], columnLabels = [] }: EvalColumnsMenuProps) {
  const store = useDataTableStore();
  const { resetColumns, columnOrder, setColumnOrder, columnVisibility, setColumnVisibility } = useStore(
    store,
    (state) => ({
      resetColumns: state.resetColumns,
      columnOrder: state.columnOrder,
      setColumnOrder: state.setColumnOrder,
      columnVisibility: state.columnVisibility,
      setColumnVisibility: state.setColumnVisibility,
    })
  );

  const addCustomColumn = useEvalStore((s) => s.addCustomColumn);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);

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
        const newColumnOrder = arrayMove(columnOrder, oldIndex, newIndex);
        setColumnOrder(newColumnOrder);
      }
    }
  }

  function handleToggleVisibility(columnId: string) {
    if (lockedColumns.includes(columnId)) return;

    setColumnVisibility({
      ...columnVisibility,
      [columnId]: !(columnVisibility[columnId] !== false),
    });
  }

  const handleAddColumn = (column: CustomColumn) => {
    addCustomColumn(column);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="text-secondary-foreground" icon="columns2" variant="outline">
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="relative min-w-32">
          <DropdownMenuGroup>
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
                      onToggleVisibility={handleToggleVisibility}
                      onDelete={labelEntry?.onDelete}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={resetColumns}>
            <ListRestart className="w-3.5 h-3.5 text-secondary-foreground" />
            Reset columns
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setIsAddColumnOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 text-secondary-foreground" />
            Add SQL column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddCustomColumnDialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen} onAdd={handleAddColumn} />
    </>
  );
}
