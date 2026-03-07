"use client";

import { LayoutGrid, List, SquareArrowOutUpRight } from "lucide-react";
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
import SignalCards, { type CardVariant } from "@/components/signals/signal-cards.tsx";
import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import Header from "@/components/ui/header.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import { TableCell, TableRow } from "@/components/ui/table";
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

type ViewMode = "table" | CardVariant;

const CARD_VARIANT_LABELS: { value: CardVariant; label: string }[] = [
  { value: 1, label: "Compact" },
  { value: 2, label: "Sparkline" },
  { value: 3, label: "Tags" },
  { value: 4, label: "Dashboard" },
  { value: 5, label: "Horizontal" },
];

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No signals yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Signals let you track outcomes, behaviors, and failures in your traces using LLM-based evaluation. Click +
            Signal above to get started.
          </p>
          <a
            href="https://docs.laminar.sh/signals"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

export default function Signals() {
  return (
    <DataTableStateProvider storageKey="signals-table" uniqueKey="id" defaultColumnOrder={defaultSignalsColumnsOrder}>
      <SignalsContent />
    </DataTableStateProvider>
  );
}

function ViewModeButtonGroup({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-input bg-secondary/50 p-0.5">
      <button
        type="button"
        onClick={() => onViewModeChange("table")}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
          viewMode === "table"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <List className="size-3.5" />
        Table
      </button>
      {CARD_VARIANT_LABELS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onViewModeChange(value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
            viewMode === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutGrid className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function SignalsContent() {
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { rowSelection, onRowSelectionChange } = useSelection();
  const [sparklineScale, setSparklineScale] = useState<SparklineScale>("week");
  const [sparklineData, setSparklineData] = useState<SignalSparklineData>({});
  const [viewMode, setViewMode] = useState<ViewMode>("table");

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

  const isCardView = viewMode !== "table";

  return (
    <>
      <Header path="signals" />
      <div className="flex flex-col gap-4 overflow-hidden px-4 pb-4">
        {/* View mode toggle */}
        <div className="flex items-center justify-between">
          <ViewModeButtonGroup viewMode={viewMode} onViewModeChange={setViewMode} />
          <ManageSignalSheet open={isDialogOpen} setOpen={setIsDialogOpen} onSuccess={handleSuccess}>
            <Button icon="plus" className="w-fit" onClick={() => setIsDialogOpen(true)}>
              Signal
            </Button>
          </ManageSignalSheet>
        </div>

        <div className="flex flex-col gap-2 items-start">
          <div className="flex flex-1 w-full space-x-2 pt-1">
            <DataTableFilter columns={signalsTableFilters} />
            {!isCardView && (
              <ColumnsMenu
                lockedColumns={["__row_selection"]}
                columnLabels={signalsColumns.map((column) => ({
                  id: column.id!,
                  label: typeof column.header === "string" ? column.header : column.id!,
                }))}
              />
            )}
            <DataTableSearch className="mr-0.5" placeholder="Search by signal name..." />
          </div>
          <DataTableFilterList />
        </div>

        {isCardView ? (
          <div className="overflow-y-auto flex-1">
            <SignalCards
              signals={eventDefinitions}
              projectId={projectId as string}
              sparklineData={sparklineData}
              sparklineMaxCount={sparklineMaxCount}
              variant={viewMode as CardVariant}
              isLoading={isLoading}
              hasActiveFilters={filter.length > 0 || !!search}
            />
            {/* Load more trigger for infinite scroll in card view */}
            {hasMore && !isLoading && (
              <div className="flex justify-center py-4">
                <Button variant="ghost" onClick={() => fetchNextPage()} disabled={isFetching}>
                  {isFetching ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </div>
        ) : (
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
            emptyRow={filter.length === 0 && !search ? EmptyRow : undefined}
          />
        )}
      </div>
    </>
  );
}
