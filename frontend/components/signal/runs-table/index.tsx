"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { DEFAULT_PAST_HOURS, DEFAULT_TARGET_BARS, RESOURCE } from "@/components/signal/runs-table/constants";
import { RunsTableContents } from "@/components/signal/runs-table/table-contents";
import { RunsTableControls } from "@/components/signal/runs-table/table-controls";
import { useSignalStoreContext } from "@/components/signal/store";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

import {
  defaultRunsColumnOrder,
  defaultRunsColumnVisibility,
  getSignalRunsColumns,
  signalRunsFilters,
} from "./columns";

function RunsTableContent() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const signal = useSignalStoreContext((state) => state.signal);
  const refetchRef = useRef<() => void>(() => {});
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartContainerWidth, setChartContainerWidth] = useState<number | null>(null);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const { effective, isLoading: isViewLoading, setFilters, setSearchAndFilters } = useTableView();

  const dateRange = useMemo(
    () => ({
      pastHours: pastHours ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    }),
    [pastHours, startDate, endDate]
  );

  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const columns = useMemo(() => getSignalRunsColumns(), []);
  const columnLabels = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
      })),
    [columns]
  );

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${params.projectId}/signals/${signal.id}/runs/stats`,
    chartContainerWidth,
    pastHours,
    startDate,
    endDate,
    filters: filter,
    defaultTargetBars: DEFAULT_TARGET_BARS,
  });

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(chartContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("pastHours", DEFAULT_PAST_HOURS);
      router.replace(`${pathName}?${next.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const handleRefresh = useCallback(() => {
    if (isViewLoading) return;
    refetchRef.current();
    mutate((key) => typeof key === "string" && key.includes(`/signals/${signal.id}/runs/stats`));
  }, [isViewLoading, mutate, signal.id]);

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <RunsTableContents refetchRef={refetchRef} filters={effective.filters} dateRange={dateRange}>
        <RunsTableControls
          projectId={params.projectId}
          filterColumns={signalRunsFilters}
          columnLabels={columnLabels}
          filters={effective.filters}
          onFiltersChange={setFilters}
          searchValue={searchValue}
          onSearchChange={setSearchAndFilters}
          onRefresh={handleRefresh}
          chartContainerRef={chartContainerRef}
          chartContainerWidth={chartContainerWidth}
          statsUrl={isViewLoading ? null : statsUrl}
        />
      </RunsTableContents>
    </div>
  );
}

export default function SignalRunsTable() {
  const params = useParams<{ projectId: string }>();
  return (
    <InfiniteDataTableProvider
      uniqueKey="runId"
      defaults={{ columnOrder: defaultRunsColumnOrder, columnVisibility: defaultRunsColumnVisibility }}
      views={{ projectId: params.projectId, resource: RESOURCE }}
    >
      <RunsTableContent />
    </InfiniteDataTableProvider>
  );
}
