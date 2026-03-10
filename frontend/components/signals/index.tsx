"use client";

import { useParams, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  defaultSignalsColumnsOrder,
  signalsColumns,
  signalsTableFilters,
  type SignalTableMeta,
  type SparklineScale,
} from "@/components/signals/columns.tsx";
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
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";
import { useToast } from "@/lib/hooks/use-toast";

import EmptyRow from "./empty-row";

export default function Signals() {
  return (
    <DataTableStateProvider storageKey="signals-table" uniqueKey="id" defaultColumnOrder={defaultSignalsColumnsOrder}>
      <SignalsContent />
    </DataTableStateProvider>
  );
}

// TODO: one component per file please, move this one out
function SignalsContent() {
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { rowSelection, onRowSelectionChange } = useSelection();
  const [sparklineScale, setSparklineScale] = useState<SparklineScale>("week");
  const [sparklineData, setSparklineData] = useState<SignalSparklineData>({});

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

  // Fetch sparkline stats when signals data or scale changes
  const signalIdsCacheKey = useMemo(() => eventDefinitions.map((s) => s.id).join(","), [eventDefinitions]);

  useEffect(() => {
    if (signalIdsCacheKey.length === 0) return;

    const signalIds = signalIdsCacheKey.split(",");
    const urlParams = new URLSearchParams();
    signalIds.forEach((id) => urlParams.append("signalId", id));
    urlParams.set("scale", sparklineScale);

    fetch(`/api/projects/${projectId}/signals/stats?${urlParams.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch sparkline stats: ${res.status}`);
        return res.json();
      })
      .then((data: SignalSparklineData) => {
        setSparklineData(data);
      })
      .catch((err) => {
        toast({
          title: "Failed to load sparkline data",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      });
  }, [signalIdsCacheKey, sparklineScale, projectId, toast]);

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

  const sparklineMaxCount = useMemo(() => {
    let max = 0;
    for (const points of Object.values(sparklineData)) {
      for (const p of points) {
        if (p.count > max) max = p.count;
      }
    }
    return max || undefined;
  }, [sparklineData]);

  const tableMeta: SignalTableMeta = useMemo(
    () => ({
      sparklineData,
      sparklineScale,
      sparklineMaxCount,
      onScaleChange: setSparklineScale,
    }),
    [sparklineData, sparklineScale, sparklineMaxCount]
  );

  return (
    <>
      <Header path="signals" />
      <div className="flex flex-col gap-4 overflow-hidden px-4 pb-4">
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
          meta={tableMeta}
          estimatedRowHeight={64}
          selectionPanel={(selectedRowIds) => (
            <div className="flex flex-col space-y-2">
              <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDelete} entityName="signals" />
            </div>
          )}
          emptyRow={filter.length === 0 && !search ? <EmptyRow /> : undefined}
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
            <div className="flex-1" />
            <ManageSignalSheet open={isDialogOpen} setOpen={setIsDialogOpen} onSuccess={handleSuccess}>
              <Button icon="plus" className="w-fit" onClick={() => setIsDialogOpen(true)}>
                Signal
              </Button>
            </ManageSignalSheet>
          </div>
          <DataTableFilterList />
        </InfiniteDataTable>
      </div>
    </>
  );
}
