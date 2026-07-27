"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { TracesTableChrome } from "@/components/traces/traces-table/chrome";
import {
  defaultTracesColumnOrder,
  filters as staticFilters,
  PREVIEW_COLUMN,
} from "@/components/traces/traces-table/columns";
import { DEFAULT_TARGET_BARS, RESOURCE } from "@/components/traces/traces-table/constants";
import { TracesTableGrid } from "@/components/traces/traces-table/grid";
import { buildColumnDefs, toColumnsPayload } from "@/components/traces/traces-table/traces-table-store";
import { useTableConfigStore, useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { cn } from "@/lib/utils";

export default function TracesTable({ className, ...props }: ComponentProps<"div">) {
  const { projectId } = useParams();
  return (
    <div className={cn("flex flex-1 min-h-0 overflow-hidden", className)} {...props}>
      <InfiniteDataTableProvider
        defaults={{ columnOrder: defaultTracesColumnOrder }}
        lockedColumns={["status", "preview"]}
        views={{ projectId: String(projectId), resource: RESOURCE }}
      >
        <TracesTableContent />
      </InfiniteDataTableProvider>
    </div>
  );
}

function TracesTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const refetchRef = useRef<() => void>(() => {});

  const setChartContainerWidth = useTracesStoreContext((s) => s.setChartContainerWidth);
  const fetchStats = useTracesStoreContext((s) => s.fetchStats);
  const chartContainerWidth = useTracesStoreContext((s) => s.chartContainerWidth);

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const searchIn = searchParams.getAll("searchIn");

  const { effective, isLoading: isViewLoading, setSort, setSearchAndFilters, setFilters } = useTableView();

  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const textSearchFilter = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = (effective.sortDirection ?? undefined) as "asc" | "desc" | undefined;

  const { customColumns, removeCustomColumn } = useTableConfigStore(
    (s) => ({
      customColumns: s.config.customColumns,
      removeCustomColumn: s.removeCustomColumn,
    }),
    shallow
  );

  const columnDefs = useMemo(() => buildColumnDefs(customColumns), [customColumns]);

  const allFilters = useMemo<ColumnFilter[]>(() => {
    const customColumnFilters: ColumnFilter[] = customColumns.map((cc) => ({
      name: cc.name,
      key: `custom:${cc.name}`,
      dataType: cc.dataType === "number" ? ("number" as const) : ("string" as const),
    }));
    return [...staticFilters, ...customColumnFilters];
  }, [customColumns]);

  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const isSearchActive = typeof textSearchFilter === "string" && textSearchFilter.length > 0;

  const effectiveColumns = useMemo(() => {
    if (!isSearchActive) return columnDefs;
    const statusIdx = columnDefs.findIndex((c) => c.id === "status");
    const cols = [...columnDefs];
    cols.splice(statusIdx + 1, 0, PREVIEW_COLUMN);
    return cols;
  }, [columnDefs, isSearchActive]);

  const pinnedColumns = useMemo(() => (isSearchActive ? ["status", "preview"] : ["status"]), [isSearchActive]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(chartContainerRef.current);
    return () => resizeObserver.disconnect();
  }, [setChartContainerWidth]);

  const customColumnsJson = useMemo(() => {
    const customCols = toColumnsPayload(columnDefs.filter((c) => c.meta?.isCustom));
    return customCols.length > 0 ? JSON.stringify(customCols) : undefined;
  }, [columnDefs]);

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${projectId}/traces/stats`,
    chartContainerWidth,
    pastHours,
    startDate,
    endDate,
    filters: filter,
    additionalParams: {
      ...(textSearchFilter && { search: textSearchFilter }),
      ...(searchIn.length > 0 && { searchIn }),
      ...(customColumnsJson && { customColumns: customColumnsJson }),
    },
    defaultTargetBars: DEFAULT_TARGET_BARS,
  });

  useEffect(() => {
    if (isViewLoading) return;
    if (statsUrl) fetchStats(statsUrl);
  }, [isViewLoading, statsUrl, fetchStats]);

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const handleRefresh = useCallback(() => {
    refetchRef.current();
    if (statsUrl) fetchStats(statsUrl);
  }, [statsUrl, fetchStats]);

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  const columnLabels = useMemo(
    () =>
      columnDefs.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
        ...(column.id!.startsWith("custom:") && {
          onDelete: () => removeCustomColumn(column.id!.replace("custom:", "")),
        }),
      })),
    [columnDefs, removeCustomColumn]
  );

  const chrome = (
    <TracesTableChrome
      projectId={String(projectId)}
      allFilters={allFilters}
      filters={effective.filters}
      onFiltersChange={setFilters}
      columnLabels={columnLabels}
      columnDefs={columnDefs}
      onRefresh={handleRefresh}
      searchValue={searchValue}
      onSearchChange={setSearchAndFilters}
      chartContainerRef={chartContainerRef}
    />
  );

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <TracesTableGrid
        chrome={chrome}
        refetchRef={refetchRef}
        columnDefs={columnDefs}
        effectiveColumns={effectiveColumns}
        pinnedColumns={pinnedColumns}
        columnSqls={columnSqls}
        filter={filter}
        textSearchFilter={textSearchFilter}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
        pastHours={pastHours}
        startDate={startDate}
        endDate={endDate}
        searchIn={searchIn}
        isViewLoading={isViewLoading}
      />
    </div>
  );
}
