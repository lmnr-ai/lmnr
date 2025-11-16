import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ListRestart } from "lucide-react";
import React from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useDataTableStore } from "@/widgets/ui/infinite-datatable/model/datatable-store.tsx";
import { ColumnsMenuItem } from "@/widgets/ui/infinite-datatable/ui/columns-menu-item.tsx";

interface ColumnsMenuProps {
  lockedColumns?: string[];
}

export default function ColumnsMenu({ lockedColumns = [] }: ColumnsMenuProps) {
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon="columns2" variant="outline">
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
            {columnOrder.map((columnId) => (
              <ColumnsMenuItem
                key={columnId}
                id={columnId}
                isVisible={columnVisibility[columnId] !== false}
                isLocked={lockedColumns.includes(columnId)}
                onToggleVisibility={handleToggleVisibility}
              />
            ))}
          </SortableContext>
        </DndContext>
        <DropdownMenuItem
          className="flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 outline-hidden"
          onClick={resetColumns}
        >
          <ListRestart className="w-3.5 h-3.5 text-secondary-foreground" />
          Reset columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
