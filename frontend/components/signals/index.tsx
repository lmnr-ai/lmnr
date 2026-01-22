"use client";

import { useParams, useSearchParams } from "next/navigation";
import React, { useCallback, useState } from "react";

import { defaultSignalsColumnsOrder, signalsColumns, signalsTableFilters } from "@/components/signals/columns.tsx";
import ManageSignalSheet from "@/components/signals/manage-signal-sheet.tsx";
import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import Header from "@/components/ui/header.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import { useProjectContext } from "@/contexts/project-context";
import { type SignalRow } from "@/lib/actions/signals";
import { useToast } from "@/lib/hooks/use-toast";

export default function Signals() {
  return (
    <DataTableStateProvider storageKey="signals-table" uniqueKey="id" defaultColumnOrder={defaultSignalsColumnsOrder}>
      <SignalsContent />
    </DataTableStateProvider>
  );
}

function SignalsContent() {
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

  const fetchSignals = useCallback(
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

        const response = await fetch(`/api/projects/${projectId}/signals?${urlParams.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch signals");

        const data = (await response.json()) as { items: SignalRow[] };
        return { items: data.items };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load signals.",
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
  } = useInfiniteScroll<SignalRow>({
    fetchFn: fetchSignals,
    enabled: true,
    deps: [endDate, filter, pastHours, projectId, startDate, search],
  });

  const handleSuccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleDelete = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/signals`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: selectedRowIds }),
        });

        if (!res.ok) {
          throw new Error("Failed to delete signals");
        }

        updateData((currentData) => currentData.filter((eventDef) => !selectedRowIds.includes(eventDef.id)));
        onRowSelectionChange({});

        toast({
          title: "Signals deleted",
          description: `Successfully deleted ${selectedRowIds.length} signal(s).`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete signals. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, toast, updateData, onRowSelectionChange]
  );

  return (
    <>
      <Header path="signals" />
      <div className="flex flex-col gap-4 overflow-hidden px-4 pb-4">
        {!isFreeTier && (
          <div className="flex items-center gap-2">
            <ManageSignalSheet open={isDialogOpen} setOpen={setIsDialogOpen} onSuccess={handleSuccess}>
              <Button icon="plus" className="w-fit" onClick={() => setIsDialogOpen(true)}>
                Signal
              </Button>
            </ManageSignalSheet>
          </div>
        )}
        <InfiniteDataTable<SignalRow>
          columns={signalsColumns}
          data={eventDefinitions}
          getRowId={(row) => row.id}
          getRowHref={(row) => `/project/${projectId}/signals/${row.original.id}`}
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
              <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDelete} entityName="signals" />
            </div>
          )}
        >
          <div className="flex flex-1 w-full space-x-2 pt-1">
            <DataTableFilter columns={signalsTableFilters} />
            <ColumnsMenu
              lockedColumns={["__row_selection"]}
              columnLabels={signalsColumns.map((column) => ({
                id: column.id!,
                label: typeof column.header === "string" ? column.header : column.id!,
              }))}
            />
            <DataTableSearch className="mr-0.5" placeholder="Search by signal name..." />
          </div>
          <DataTableFilterList />
        </InfiniteDataTable>
      </div>
    </>
  );
}
