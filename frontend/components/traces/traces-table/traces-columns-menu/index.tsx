import { AnimatePresence } from "framer-motion";
import React, { useState } from "react";
import { useStore } from "zustand";

import { ColumnsListPanel } from "@/components/evaluation/eval-columns-menu/columns-list-panel";
import { type CustomColumn, useTracesTableStore } from "@/components/traces/traces-table/traces-table-store";
import { Button } from "@/components/ui/button.tsx";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

import { CustomColumnPanel } from "./custom-column-panel";

interface TracesColumnsMenuProps {
  lockedColumns?: string[];
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
}

export default function TracesColumnsMenu({ lockedColumns = [], columnLabels = [] }: TracesColumnsMenuProps) {
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

  const addCustomColumn = useTracesTableStore((s) => s.addCustomColumn);
  const updateCustomColumn = useTracesTableStore((s) => s.updateCustomColumn);

  const [isOpen, setIsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"list" | "form">("list");
  const [editingColumn, setEditingColumn] = useState<CustomColumn | null>(null);

  function handleToggleVisibility(columnId: string) {
    if (lockedColumns.includes(columnId)) return;

    setColumnVisibility({
      ...columnVisibility,
      [columnId]: !(columnVisibility[columnId] !== false),
    });
  }

  const handleEditColumn = (columnId: string) => {
    const col = useTracesTableStore.getState().columnDefs.find((c) => c.id === columnId);
    if (col?.meta?.isCustom) {
      setEditingColumn({
        name: col.header as string,
        sql: col.meta.sql!,
        dataType: col.meta.dataType as "string" | "number",
      });
      setActivePanel("form");
    }
  };

  const handleSave = (column: CustomColumn) => {
    if (editingColumn) {
      updateCustomColumn(editingColumn.name, column);
    } else {
      addCustomColumn(column);
    }
    setEditingColumn(null);
    setActivePanel("list");
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setActivePanel("list");
      setEditingColumn(null);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button className="text-secondary-foreground" icon="columns2" variant="outline">
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 overflow-hidden w-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest(".cm-tooltip-autocomplete")) {
            e.preventDefault();
          }
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {activePanel === "list" ? (
            <ColumnsListPanel
              columnOrder={columnOrder}
              columnVisibility={columnVisibility}
              columnLabels={columnLabels}
              lockedColumns={lockedColumns}
              onReorder={setColumnOrder}
              onToggleVisibility={handleToggleVisibility}
              onReset={resetColumns}
              onCustomColumnClick={() => {
                setEditingColumn(null);
                setActivePanel("form");
              }}
              onEditColumn={handleEditColumn}
            />
          ) : (
            <CustomColumnPanel
              key={editingColumn?.name ?? "__new__"}
              onBack={() => {
                setEditingColumn(null);
                setActivePanel("list");
              }}
              onSave={handleSave}
              editingColumn={editingColumn ?? undefined}
            />
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
