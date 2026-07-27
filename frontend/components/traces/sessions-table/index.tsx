"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef } from "react";

import { SessionsTableChrome } from "@/components/traces/sessions-table/chrome";
import { defaultSessionsColumnOrder } from "@/components/traces/sessions-table/columns";
import { RESOURCE } from "@/components/traces/sessions-table/constants";
import { SessionsTableGrid } from "@/components/traces/sessions-table/grid";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
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

  const chrome = (
    <SessionsTableChrome
      projectId={String(projectId)}
      filters={effective.filters}
      onFiltersChange={setFilters}
      onRefresh={handleRefresh}
      searchValue={searchValue}
      onSearchChange={setSearchAndFilters}
    />
  );

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <SessionsTableGrid
        chrome={chrome}
        refetchRef={refetchRef}
        filter={filter}
        textSearchFilter={textSearchFilter}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
        pastHours={pastHours}
        startDate={startDate}
        endDate={endDate}
        isViewLoading={isViewLoading}
      />
    </div>
  );
}
