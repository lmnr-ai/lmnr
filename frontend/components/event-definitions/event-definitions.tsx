"use client";

import { Row } from "@tanstack/react-table";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";

import { columns } from "@/components/event-definitions/columns.tsx";
import ManageEventDefinitionDialog from "@/components/event-definitions/manage-event-definition-dialog";
import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { useProjectContext } from "@/contexts/project-context";
import { EventDefinitionRow } from "@/lib/actions/event-definitions";
import { useToast } from "@/lib/hooks/use-toast";

import Header from "../ui/header";

export default function EventDefinitions() {
  return (
    <DataTableStateProvider storageKey="event-definitions-table" uniqueKey="id">
      <EventDefinitionsContent />
    </DataTableStateProvider>
  );
}

function EventDefinitionsContent() {
  const router = useRouter();
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { workspace } = useProjectContext();
  const { toast } = useToast();
  const { rowSelection, onRowSelectionChange } = useSelection();

  const isFreeTier = workspace?.tierName.toLowerCase().trim() === "free";

  const fetchEventDefinitions = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/event-definitions`);
      if (!response.ok) throw new Error("Failed to fetch event definitions");

      const data = (await response.json()) as EventDefinitionRow[];
      // Since API doesn't paginate, return all data on first page
      return { items: data, count: data.length };
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load event definitions.",
        variant: "destructive",
      });
      throw error;
    }
  }, [projectId, toast]);

  const {
    data: eventDefinitions,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    updateData,
  } = useInfiniteScroll<EventDefinitionRow>({
    fetchFn: fetchEventDefinitions,
    enabled: true,
    deps: [projectId],
  });

  const handleRowClick = useCallback(
    (row: Row<EventDefinitionRow>) => {
      router.push(`/project/${projectId}/events/${row.original.id}`);
    },
    [projectId, router]
  );

  const handleSuccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleDeleteEventDefinitions = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/event-definitions`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: selectedRowIds }),
        });

        if (!res.ok) {
          throw new Error("Failed to delete event definitions");
        }

        updateData((currentData) => currentData.filter((eventDef) => !selectedRowIds.includes(eventDef.id)));
        onRowSelectionChange({});

        toast({
          title: "Event definitions deleted",
          description: `Successfully deleted ${selectedRowIds.length} event definition(s).`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete event definitions. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, toast, updateData, onRowSelectionChange]
  );

  return (
    <>
      <Header path="event definitions" />
      <div className="flex flex-col gap-4 overflow-hidden px-4 pb-4">
        {!isFreeTier && (
          <ManageEventDefinitionDialog open={isDialogOpen} setOpen={setIsDialogOpen} onSuccess={handleSuccess}>
            <Button icon="plus" className="w-fit" onClick={() => setIsDialogOpen(true)}>
              Event Definition
            </Button>
          </ManageEventDefinitionDialog>
        )}
        <InfiniteDataTable<EventDefinitionRow>
          columns={columns}
          data={eventDefinitions}
          getRowId={(row) => row.id}
          onRowClick={handleRowClick}
          hasMore={hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
          estimatedRowHeight={41}
          enableRowSelection
          state={{
            rowSelection,
          }}
          onRowSelectionChange={onRowSelectionChange}
          lockedColumns={["__row_selection"]}
          selectionPanel={(selectedRowIds) => (
            <div className="flex flex-col space-y-2">
              <DeleteSelectedRows
                selectedRowIds={selectedRowIds}
                onDelete={handleDeleteEventDefinitions}
                entityName="event definitions"
              />
            </div>
          )}
        />
      </div>
    </>
  );
}
