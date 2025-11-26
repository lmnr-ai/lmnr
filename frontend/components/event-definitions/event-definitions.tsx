"use client";

import { Row } from "@tanstack/react-table";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useState } from "react";

import {
  columns,
  defaultEventDefinitionsColumnOrder,
  eventsDefinitionsTableFilters,
} from "@/components/event-definitions/columns.tsx";
import ManageEventDefinitionDialog from "@/components/event-definitions/manage-event-definition-dialog";
import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import { useProjectContext } from "@/contexts/project-context";
import { EventDefinitionRow } from "@/lib/actions/event-definitions";
import { useToast } from "@/lib/hooks/use-toast";

import Header from "../ui/header";

export default function EventDefinitions() {
  return (
    <DataTableStateProvider
      storageKey="event-definitions-table"
      uniqueKey="id"
      defaultColumnOrder={defaultEventDefinitionsColumnOrder}
    >
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

  const searchParams = useSearchParams();
  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const search = searchParams.get("search");

  const FETCH_SIZE = 50;

  const fetchEventDefinitions = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (pastHours != null) urlParams.set("pastHours", pastHours);
        if (startDate != null) urlParams.set("startDate", startDate);
        if (endDate != null) urlParams.set("endDate", endDate);

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        const response = await fetch(`/api/projects/${projectId}/event-definitions?${urlParams.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch event definitions");

        const data = (await response.json()) as { items: EventDefinitionRow[] };
        return { items: data.items };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load event definitions.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [endDate, filter, pastHours, projectId, startDate, search, toast]
  );

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
    deps: [endDate, filter, pastHours, projectId, startDate, search],
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
        >
          <div className="flex flex-1 w-full space-x-2">
            <DataTableFilter columns={eventsDefinitionsTableFilters} />
            <ColumnsMenu
              lockedColumns={["__row_selection"]}
              columnLabels={columns.map((column) => ({
                id: column.id!,
                label: typeof column.header === "string" ? column.header : column.id!,
              }))}
            />
            <DataTableSearch searchColumns={["name"]} placeholder="Search by name..." />
          </div>
          <DataTableFilterList />
        </InfiniteDataTable>
      </div>
    </>
  );
}
