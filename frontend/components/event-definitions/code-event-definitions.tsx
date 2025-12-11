"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useCallback } from "react";

import {
  columns,
  defaultEventDefinitionsColumnOrder,
  eventsDefinitionsTableFilters,
} from "@/components/event-definitions/columns.tsx";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { EventDefinitionRow } from "@/lib/actions/event-definitions";
import { useToast } from "@/lib/hooks/use-toast";

import Header from "../ui/header";

export default function CodeEventDefinitions() {
  return (
    <DataTableStateProvider
      storageKey="event-definitions-table"
      uniqueKey="id"
      defaultColumnOrder={defaultEventDefinitionsColumnOrder}
    >
      <CodeEventDefinitionsContent />
    </DataTableStateProvider>
  );
}

function CodeEventDefinitionsContent() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { rowSelection, onRowSelectionChange } = useSelection();

  const searchParams = useSearchParams();
  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const search = searchParams.get("search");

  const FETCH_SIZE = 50;

  const fetchCodeEventDefinitions = useCallback(
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
    updateData,
  } = useInfiniteScroll<EventDefinitionRow>({
    fetchFn: fetchCodeEventDefinitions,
    enabled: true,
    deps: [endDate, filter, pastHours, projectId, startDate, search],
  });

  const handleDelete = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/event-definitions`, {
          method: "DELETE",
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
      <Tabs className="flex flex-1 overflow-hidden gap-4" value="code">
        <TabsList className="mx-4 h-8">
          <TabsTrigger className="text-xs" value="SEMANTIC" asChild>
            <Link href={`/project/${projectId}/events/semantic`}>Semantic</Link>
          </TabsTrigger>
          <TabsTrigger className="text-xs" value="code" asChild>
            <Link href={`/project/${projectId}/events/code`}>Code</Link>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="code" asChild>
          <div className="flex flex-col gap-4 overflow-hidden px-4 pb-4">
            <InfiniteDataTable<EventDefinitionRow>
              columns={columns}
              data={eventDefinitions}
              getRowId={(row) => row.id}
              getRowHref={(row) => `/project/${projectId}/events/code/${row.original.id}`}
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
                    onDelete={handleDelete}
                    entityName="event definitions"
                  />
                </div>
              )}
            >
              <div className="flex flex-1 w-full space-x-2 pt-1">
                <DataTableFilter columns={eventsDefinitionsTableFilters} />
                <ColumnsMenu
                  lockedColumns={["__row_selection"]}
                  columnLabels={columns.map((column) => ({
                    id: column.id!,
                    label: typeof column.header === "string" ? column.header : column.id!,
                  }))}
                />
                <DataTableSearch className="mr-0.5" placeholder="Search by event definition name..." />
              </div>
              <DataTableFilterList />
            </InfiniteDataTable>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
