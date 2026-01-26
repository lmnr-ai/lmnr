"use client";

import { type Row, type RowSelectionState } from "@tanstack/react-table";
import { isEqual } from "lodash";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";

import { useSignalStoreContext } from "@/components/signal/store.tsx";
import {
  defaultTriggersColumnOrder,
  type TriggerRow,
  triggersFilters,
  triggersTableColumns,
} from "@/components/signal/triggers-table/columns.tsx";
import ManageTriggerDialog from "@/components/signals/manage-trigger-dialog";
import { Button } from "@/components/ui/button.tsx";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import FilterPopover, { FilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter/ui";
import { type Filter } from "@/lib/actions/common/filters.ts";
import { type Trigger } from "@/lib/actions/signal-triggers";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

function TriggersTableContent() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();

  const {
    signal,
    triggersFilters: storeTriggersFilters,
    setTriggersFilters,
  } = useSignalStoreContext((state) => ({
    signal: state.signal,
    triggersFilters: state.triggersFilters,
    setTriggersFilters: state.setTriggersFilters,
  }));

  const triggersUrl = useMemo(() => {
    const urlParams = new URLSearchParams();
    storeTriggersFilters.forEach((f) => urlParams.append("filter", JSON.stringify(f)));
    const queryString = urlParams.toString();
    return `/api/projects/${params.projectId}/signals/${signal.id}/triggers${queryString ? `?${queryString}` : ""}`;
  }, [params.projectId, signal.id, storeTriggersFilters]);

  const triggersBaseUrl = `/api/projects/${params.projectId}/signals/${signal.id}/triggers`;

  const { data, isLoading, error } = useSWR<{ items: Trigger[] }>(triggersUrl, swrFetcher);

  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const triggers: TriggerRow[] = data?.items || [];

  const handleAddFilter = useCallback(
    (filter: Filter) => {
      setTriggersFilters((prev) => [...prev, filter]);
    },
    [setTriggersFilters]
  );

  const handleRemoveFilter = useCallback(
    (filter: Filter) => {
      setTriggersFilters((prev) => prev.filter((f) => !isEqual(f, filter)));
    },
    [setTriggersFilters]
  );

  useEffect(() => {
    if (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load triggers.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleRowClick = useCallback((row: Row<TriggerRow>) => {
    setEditingTrigger(row.original);
    setIsEditDialogOpen(true);
  }, []);

  const handleAddTrigger = useCallback(
    async (newTrigger: Trigger) => {
      try {
        const response = await fetch(triggersBaseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: newTrigger.filters }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create trigger");
        }

        await mutate(triggersUrl);
        toast({ title: "Trigger added successfully" });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to add trigger",
        });
        throw error;
      }
    },
    [triggersBaseUrl, triggersUrl, toast]
  );

  const handleEditTrigger = useCallback(
    async (updatedTrigger: Trigger) => {
      if (editingTrigger === null) return;

      try {
        const response = await fetch(triggersBaseUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            triggerId: editingTrigger.id,
            filters: updatedTrigger.filters,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update trigger");
        }

        await mutate(triggersUrl);
        setEditingTrigger(null);
        toast({ title: "Trigger updated successfully" });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to update trigger",
        });
        throw error;
      }
    },
    [editingTrigger, triggersBaseUrl, triggersUrl, toast]
  );

  const handleDeleteTriggers = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const response = await fetch(triggersBaseUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerIds: selectedRowIds }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to delete triggers");
        }

        await mutate(triggersUrl);
        setRowSelection({});
        toast({
          title: "Triggers deleted",
          description: `Successfully deleted ${selectedRowIds.length} trigger(s).`,
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete triggers",
        });
      }
    },
    [triggersBaseUrl, triggersUrl, toast]
  );

  return (
    <>
      <ManageTriggerDialog open={isAddDialogOpen} setOpen={setIsAddDialogOpen} onSave={handleAddTrigger}>
        <Button className="w-fit" icon="plus">
          Add Trigger
        </Button>
      </ManageTriggerDialog>
      <InfiniteDataTable<TriggerRow>
        className="w-full"
        columns={triggersTableColumns}
        data={triggers}
        getRowId={(trigger) => trigger.id}
        lockedColumns={["__row_selection"]}
        hasMore={false}
        isFetching={isLoading}
        isLoading={isLoading}
        fetchNextPage={() => {}}
        onRowClick={handleRowClick}
        enableRowSelection
        state={{ rowSelection }}
        onRowSelectionChange={setRowSelection}
        selectionPanel={(selectedRowIds) => (
          <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDeleteTriggers} entityName="triggers" />
        )}
      >
        <div className="flex flex-1 w-full space-x-2">
          <FilterPopover columns={triggersFilters} filters={storeTriggersFilters} onAddFilter={handleAddFilter} />
          <ColumnsMenu
            lockedColumns={["__row_selection"]}
            columnLabels={triggersTableColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
        </div>
        <FilterList
          className="py-[3px] text-xs px-1"
          filters={storeTriggersFilters}
          onRemoveFilter={handleRemoveFilter}
        />
      </InfiniteDataTable>

      <ManageTriggerDialog
        open={isEditDialogOpen}
        setOpen={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setEditingTrigger(null);
        }}
        defaultValues={editingTrigger || undefined}
        onSave={handleEditTrigger}
      />
    </>
  );
}

export default function TriggersTable() {
  return (
    <DataTableStateProvider defaultColumnOrder={["__row_selection", ...defaultTriggersColumnOrder]}>
      <TriggersTableContent />
    </DataTableStateProvider>
  );
}
