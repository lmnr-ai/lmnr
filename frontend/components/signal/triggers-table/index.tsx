"use client";

import { type Row } from "@tanstack/react-table";
import { isEqual } from "lodash";
import { useCallback, useRef, useState } from "react";

import { useSignalStoreContext } from "@/components/signal/store.tsx";
import {
  defaultTriggersColumnOrder,
  getTriggersTableColumns,
  type TriggerRow,
  triggersFilters,
} from "@/components/signal/triggers-table/columns.tsx";
import { TriggersTableContents } from "@/components/signal/triggers-table/table-contents";
import { TriggersTableControls } from "@/components/signal/triggers-table/table-controls";
import ManageTriggerDialog from "@/components/signals/manage-trigger-dialog";
import { Button } from "@/components/ui/button.tsx";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store.tsx";
import { type Filter } from "@/lib/actions/common/filters.ts";
import { type Trigger } from "@/lib/actions/signal-triggers";

function TriggersTableContent() {
  const { signal } = useSignalStoreContext((state) => ({ signal: state.signal }));
  const revalidateRef = useRef<() => void>(() => {});
  const [filters, setFilters] = useState<Filter[]>([]);
  const [editingTrigger, setEditingTrigger] = useState<Trigger>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const columns = getTriggersTableColumns();

  const handleAddFilter = useCallback((filter: Filter) => {
    setFilters((prev) => [...prev, filter]);
  }, []);

  const handleRemoveFilter = useCallback((filter: Filter) => {
    setFilters((prev) => prev.filter((f) => !isEqual(f, filter)));
  }, []);

  const handleRowClick = useCallback((row: Row<TriggerRow>) => {
    setEditingTrigger(row.original);
    setIsDialogOpen(true);
  }, []);

  const handleTriggerSuccess = useCallback(async () => {
    revalidateRef.current();
    setEditingTrigger(undefined);
  }, []);

  return (
    <>
      <ManageTriggerDialog
        open={isDialogOpen}
        setOpen={setIsDialogOpen}
        signalId={signal.id}
        defaultValues={editingTrigger}
        onSuccess={handleTriggerSuccess}
      >
        <Button className="w-fit" icon="plus">
          Add Trigger
        </Button>
      </ManageTriggerDialog>
      <TriggersTableContents filters={filters} onRowClick={handleRowClick} revalidateRef={revalidateRef}>
        <TriggersTableControls
          filterColumns={triggersFilters}
          columnLabels={columns.map((column) => ({
            id: column.id!,
            label: typeof column.header === "string" ? column.header : column.id!,
          }))}
          filters={filters}
          onAddFilter={handleAddFilter}
          onRemoveFilter={handleRemoveFilter}
        />
      </TriggersTableContents>
    </>
  );
}

export default function TriggersTable() {
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: ["__row_selection", ...defaultTriggersColumnOrder] }}
      lockedColumns={["__row_selection"]}
    >
      <TriggersTableContent />
    </InfiniteDataTableProvider>
  );
}
