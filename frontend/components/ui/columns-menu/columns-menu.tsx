import { AnimatePresence } from "framer-motion";
import React, { useCallback, useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button.tsx";
import { type CustomColumn, useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

import { ColumnsListPanel } from "./columns-list-panel";
import { CustomColumnPanel } from "./custom-column-panel";
import type { CustomColumnPanelConfig } from "./types";

interface ColumnsMenuProps {
  /** Configuration for the custom column panel (schema, test query, etc.). When omitted, the custom column UI is hidden. */
  panelConfig?: CustomColumnPanelConfig;
  /** Whether to show the "Create column with SQL" button. Defaults to true. */
  showCreateButton?: boolean;
  /** Return all current column defs for duplicate-name checking in the custom column panel. */
  getColumnDefs?: () => import("@tanstack/react-table").ColumnDef<any>[];
}

export default function ColumnsMenu({ panelConfig, showCreateButton = true, getColumnDefs }: ColumnsMenuProps) {
  const store = useDataTableStore();
  const {
    lockedColumns,
    columnLabelMap,
    resetColumns,
    columnOrder,
    setColumnOrder,
    columnVisibility,
    setColumnVisibility,
    customColumns,
    addCustomColumn,
    updateCustomColumn,
    removeCustomColumn,
  } = useStore(store, (state) => ({
    lockedColumns: state.lockedColumns,
    columnLabelMap: state.columnLabelMap,
    resetColumns: state.resetColumns,
    columnOrder: state.columnOrder,
    setColumnOrder: state.setColumnOrder,
    columnVisibility: state.columnVisibility,
    setColumnVisibility: state.setColumnVisibility,
    customColumns: state.customColumns,
    addCustomColumn: state.addCustomColumn,
    updateCustomColumn: state.updateCustomColumn,
    removeCustomColumn: state.removeCustomColumn,
  }));

  const hasCustomColumns = !!panelConfig;

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

  const handleEditColumn = useCallback(
    (columnId: string) => {
      const cc = customColumns.find((c) => `custom:${c.name}` === columnId);
      if (cc) {
        setEditingColumn(cc);
        setActivePanel("form");
      }
    },
    [customColumns]
  );

  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      removeCustomColumn(columnId.replace("custom:", ""));
    },
    [removeCustomColumn]
  );

  const handleSave = useCallback(
    (column: CustomColumn) => {
      if (editingColumn) {
        updateCustomColumn(editingColumn.name, column);
      } else {
        addCustomColumn(column);
      }
      setEditingColumn(null);
      setActivePanel("list");
    },
    [editingColumn, addCustomColumn, updateCustomColumn]
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setActivePanel("list");
      setEditingColumn(null);
    }
  };

  const panelConfigWithDefs = panelConfig
    ? { ...panelConfig, getColumnDefs: getColumnDefs ?? panelConfig.getColumnDefs }
    : undefined;

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
          ) : panelConfigWithDefs ? (
            <CustomColumnPanel
              key={editingColumn?.name ?? "__new__"}
              onBack={() => {
                setEditingColumn(null);
                setActivePanel("list");
              }}
              onSave={handleSave}
              editingColumn={editingColumn ?? undefined}
              config={panelConfigWithDefs}
            />
          ) : null}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
