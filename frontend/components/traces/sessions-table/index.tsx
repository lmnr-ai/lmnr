"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { buildSessionColumnDefs, customColumnsParam } from "@/components/traces/sessions-table/build-columns";
import { defaultSessionsColumnOrder, filters as staticFilters } from "@/components/traces/sessions-table/columns";
import { RESOURCE } from "@/components/traces/sessions-table/constants";
import SessionsChart from "@/components/traces/sessions-table/sessions-chart";
import { SessionsTableContents } from "@/components/traces/sessions-table/table-contents";
import { SessionsTableControls } from "@/components/traces/sessions-table/table-controls";
import { useTableConfigStore, useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { cn } from "@/lib/utils";

export default function SessionsTable({ className, ...props }: ComponentProps<"div">) {
  const { projectId } = useParams();
  return (
    <div className={cn("flex flex-1 min-h-0 overflow-hidden", className)} {...props}>
      <InfiniteDataTableProvider
        uniqueKey="sessionId"
        defaults={{ columnOrder: defaultSessionsColumnOrder }}
        views={{ projectId: String(projectId), resource: RESOURCE }}
      >
        <SessionsTableContent />
      </InfiniteDataTableProvider>
      <FirstInputDial />
    </div>
  );
}

function SessionsTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const refetchRef = useRef<() => void>(() => {});

  const { effective, isLoading: isViewLoading, setSort, setSearchAndFilters, setFilters } = useTableView();
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const textSearchFilter = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = (effective.sortDirection ?? undefined) as "asc" | "desc" | undefined;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");

  const { customColumns, removeCustomColumn } = useTableConfigStore(
    (s) => ({ customColumns: s.config.customColumns, removeCustomColumn: s.removeCustomColumn }),
    shallow
  );
  const columnDefs = useMemo(() => buildSessionColumnDefs(customColumns), [customColumns]);
  const customColumnsJson = useMemo(() => customColumnsParam(customColumns), [customColumns]);
  const allFilters = useMemo<ColumnFilter[]>(
    () => [
      ...staticFilters,
      ...customColumns.map((cc) => ({
        name: cc.name,
        key: `custom:${cc.name}`,
        dataType: cc.dataType === "number" ? ("number" as const) : ("string" as const),
      })),
    ],
    [customColumns]
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

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "72");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const handleRefresh = useCallback(() => {
    refetchRef.current();
  }, []);

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <SessionsTableContents
        refetchRef={refetchRef}
        columnDefs={columnDefs}
        customColumns={customColumnsJson}
        filter={filter}
        textSearchFilter={textSearchFilter}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
        pastHours={pastHours}
        startDate={startDate}
        endDate={endDate}
        isViewLoading={isViewLoading}
      >
        <SessionsTableControls
          projectId={String(projectId)}
          allFilters={allFilters}
          columnLabels={columnLabels}
          columnDefs={columnDefs}
          filters={effective.filters}
          onFiltersChange={setFilters}
          onRefresh={handleRefresh}
          searchValue={searchValue}
          onSearchChange={setSearchAndFilters}
          chart={
            <SessionsChart
              projectId={String(projectId)}
              pastHours={pastHours}
              startDate={startDate}
              endDate={endDate}
              filter={filter}
              search={textSearchFilter}
              customColumns={customColumnsJson}
              isViewLoading={isViewLoading}
            />
          }
        />
      </SessionsTableContents>
    </div>
  );
}
