import { AnimatePresence } from "framer-motion";
import React, { useState } from "react";
import { shallow } from "zustand/shallow";

import { Button } from "@/components/ui/button.tsx";
import { useTableConfigStore } from "@/components/ui/infinite-datatable/model/table-config-store.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

import { ColumnsListPanel } from "./columns-list-panel";
import { CustomColumnPanel } from "./custom-column-panel";
import type { ColumnActions, CustomColumn, CustomColumnPanelConfig } from "./types";

interface ColumnsMenuProps {
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
  /** Configuration for the custom column panel (schema, test query, etc.). */
  panelConfig?: CustomColumnPanelConfig;
  /** Store actions for managing custom columns. */
  columnActions?: ColumnActions;
}

export default function ColumnsMenu({ columnLabels = [], panelConfig, columnActions }: ColumnsMenuProps) {
  const { resetColumns, columnOrder, setColumnOrder, columnVisibility, setColumnVisibility, lockedColumns } =
    useTableConfigStore(
      (state) => ({
        resetColumns: state.resetColumns,
        columnOrder: state.config.columnOrder,
        setColumnOrder: state.setColumnOrder,
        columnVisibility: state.config.columnVisibility,
        setColumnVisibility: state.setColumnVisibility,
        lockedColumns: state.lockedColumns,
      }),
      shallow
    );

  const supportsCustomColumns = !!panelConfig && !!columnActions;
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
          // Prevent closing when interacting with CodeMirror autocomplete tooltips
          const target = e.target as HTMLElement | null;
          if (target?.closest(".cm-tooltip-autocomplete")) {
            e.preventDefault();
          }
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {activePanel === "list" || !supportsCustomColumns ? (
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
              onEditColumn={supportsCustomColumns ? handleEditColumn : undefined}
              showCreateButton={supportsCustomColumns}
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
              config={panelConfig!}
            />
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
