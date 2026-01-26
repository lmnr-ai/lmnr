"use client";

import { type Row } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";

import { useSignalStoreContext } from "@/components/signal/store.tsx";
import {
  defaultTriggersColumnOrder,
  type TriggerRow,
  triggersTableColumns,
} from "@/components/signal/triggers-table/columns.tsx";
import ManageTriggerDialog from "@/components/signals/manage-trigger-dialog";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { type Trigger } from "@/lib/actions/signal-triggers";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

function TriggersTableContent() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();

  const signal = useSignalStoreContext((state) => state.signal);

  const triggersUrl = `/api/projects/${params.projectId}/signals/${signal.id}/triggers`;

  const { data, isLoading, error } = useSWR<{ items: Trigger[] }>(triggersUrl, swrFetcher);

  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [deletingTrigger, setDeletingTrigger] = useState<Trigger | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const triggers: TriggerRow[] = data?.items || [];

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
        const response = await fetch(triggersUrl, {
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
    [triggersUrl, toast]
  );

  const handleEditTrigger = useCallback(
    async (updatedTrigger: Trigger) => {
      if (editingTrigger === null) return;

      try {
        const response = await fetch(triggersUrl, {
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
    [editingTrigger, triggersUrl, toast]
  );

  const handleDeleteTrigger = useCallback(async () => {
    if (deletingTrigger === null) return;

    try {
      setIsDeleting(true);
      const response = await fetch(triggersUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerId: deletingTrigger.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete trigger");
      }

      await mutate(triggersUrl);
      setDeletingTrigger(null);
      toast({ title: "Trigger deleted successfully" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete trigger",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deletingTrigger, triggersUrl, toast]);

  const columnsWithActions = useMemo(
    () => [
      ...triggersTableColumns,
      {
        id: "actions",
        header: "",
        size: 72,
        cell: ({ row }: { row: Row<TriggerRow> }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setDeletingTrigger(row.original);
            }}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Triggers</h3>
          <p className="text-sm text-muted-foreground">
            Configure triggers that will run this signal. Multiple triggers are combined with OR (any trigger matching
            fires the signal). Filters within each trigger are combined with AND.
          </p>
        </div>
        <ManageTriggerDialog open={isAddDialogOpen} setOpen={setIsAddDialogOpen} onSave={handleAddTrigger}>
          <Button icon="plus">Add Trigger</Button>
        </ManageTriggerDialog>
      </div>

      <InfiniteDataTable<TriggerRow>
        className="w-full"
        columns={columnsWithActions}
        data={triggers}
        getRowId={(trigger) => trigger.id}
        lockedColumns={["actions"]}
        hasMore={false}
        isFetching={isLoading}
        isLoading={isLoading}
        fetchNextPage={() => {}}
        onRowClick={handleRowClick}
      >
        <div className="flex flex-1 w-full space-x-2">
          <ColumnsMenu
            columnLabels={triggersTableColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
        </div>
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

      <ConfirmDialog
        open={deletingTrigger !== null}
        onOpenChange={(open) => !open && setDeletingTrigger(null)}
        title="Delete Trigger"
        description="Are you sure you want to delete this trigger? This action cannot be undone."
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        onConfirm={handleDeleteTrigger}
      />
    </>
  );
}

export default function TriggersTable() {
  return (
    <DataTableStateProvider defaultColumnOrder={[...defaultTriggersColumnOrder, "actions"]}>
      <TriggersTableContent />
    </DataTableStateProvider>
  );
}
