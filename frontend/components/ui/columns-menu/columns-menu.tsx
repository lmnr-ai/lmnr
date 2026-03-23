import { AnimatePresence } from "framer-motion";
import React, { useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button.tsx";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

import { ColumnsListPanel } from "./columns-list-panel";
import { CustomColumnPanel } from "./custom-column-panel";
import type { ColumnActions, CustomColumn, CustomColumnPanelConfig } from "./types";

interface ColumnsMenuProps {
  /** Configuration for the custom column panel (schema, test query, etc.). When omitted, the custom column UI is hidden. */
  panelConfig?: CustomColumnPanelConfig;
  /** Store actions for managing custom columns. Required when panelConfig is provided. */
  columnActions?: ColumnActions;
  /** Whether to show the "Create column with SQL" button. Defaults to true. */
  showCreateButton?: boolean;
}

export default function ColumnsMenu({ panelConfig, columnActions, showCreateButton = true }: ColumnsMenuProps) {
  const store = useDataTableStore();
  const {
    lockedColumns,
    columnLabelMap,
    resetColumns,
    columnOrder,
    setColumnOrder,
    columnVisibility,
    setColumnVisibility,
  } = useStore(store, (state) => ({
    lockedColumns: state.lockedColumns,
    columnLabelMap: state.columnLabelMap,
    resetColumns: state.resetColumns,
    columnOrder: state.columnOrder,
    setColumnOrder: state.setColumnOrder,
    columnVisibility: state.columnVisibility,
    setColumnVisibility: state.setColumnVisibility,
  }));

  const hasCustomColumns = !!panelConfig && !!columnActions;

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
    if (!columnActions) return;
    const col = columnActions.getColumnDef(columnId);
    if (col?.meta?.isCustom) {
      setEditingColumn({
        name: col.header as string,
        sql: col.meta.sql!,
        dataType: col.meta.dataType as "string" | "number",
      });
      setActivePanel("form");
    }
  };

  const handleDeleteColumn = (columnId: string) => {
    if (!columnActions) return;
    columnActions.removeCustomColumn(columnId.replace("custom:", ""));
  };

  const handleSave = (column: CustomColumn) => {
    if (!columnActions) return;
    if (editingColumn) {
      columnActions.updateCustomColumn(editingColumn.name, column);
    } else {
      columnActions.addCustomColumn(column);
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
              columnLabelMap={columnLabelMap}
              lockedColumns={lockedColumns}
              onReorder={setColumnOrder}
              onToggleVisibility={handleToggleVisibility}
              onReset={resetColumns}
              onCustomColumnClick={
                hasCustomColumns
                  ? () => {
                      setEditingColumn(null);
                      setActivePanel("form");
                    }
                  : undefined
              }
              onEditColumn={hasCustomColumns ? handleEditColumn : undefined}
              onDeleteColumn={hasCustomColumns ? handleDeleteColumn : undefined}
              showCreateButton={hasCustomColumns && showCreateButton}
            />
          ) : panelConfig ? (
            <CustomColumnPanel
              key={editingColumn?.name ?? "__new__"}
              onBack={() => {
                setEditingColumn(null);
                setActivePanel("list");
              }}
              onSave={handleSave}
              editingColumn={editingColumn ?? undefined}
              config={panelConfig}
            />
          ) : null}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
