"use client";

import { Row } from "@tanstack/react-table";
import { get } from "lodash";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { defaultPatternsColumnOrder, getColumns, PatternRow, patternsTableFilters } from "@/components/patterns/columns";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { useToast } from "@/lib/hooks/use-toast";

export default function PatternsTable() {
  return (
    <DataTableStateProvider
      storageKey="patterns-table"
      uniqueKey="clusterId"
      defaultColumnOrder={defaultPatternsColumnOrder}
    >
      <PatternsTableContent />
    </DataTableStateProvider>
  );
}

function PatternsTableContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const columns = useMemo(() => getColumns(projectId), [projectId]);

  const filter = searchParams.getAll("filter");
  const search = searchParams.get("search");

  const FETCH_SIZE = 50;

  const fetchPatterns = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        const url = `/api/projects/${projectId}/patterns?${urlParams.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: PatternRow[] };
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load patterns. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, toast, filter, search]
  );

  const {
    data: rawPatterns,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    error,
  } = useInfiniteScroll<PatternRow>({
    fetchFn: fetchPatterns,
    enabled: true,
    deps: [projectId, filter, search],
  });

  // Build hierarchical structure from flat data
  const patterns = useMemo(() => {
    if (!rawPatterns) return [];

    const patternMap = new Map<string, PatternRow>();
    const rootPatterns: PatternRow[] = [];

    // First pass: create map of all patterns
    rawPatterns.forEach((pattern) => {
      patternMap.set(pattern.clusterId, { ...pattern, subRows: [] });
    });

    // Second pass: build hierarchy
    rawPatterns.forEach((pattern) => {
      const node = patternMap.get(pattern.clusterId);
      if (!node) return;

      if (pattern.parentId === null) {
        rootPatterns.push(node);
      } else {
        const parent = patternMap.get(pattern.parentId);
        if (parent) {
          if (!parent.subRows) parent.subRows = [];
          parent.subRows.push(node);
        }
      }
    });

    return rootPatterns;
  }, [rawPatterns]);

  const handleRowClick = useCallback((row: Row<PatternRow>) => {
    // Just toggle expand/collapse - data is already loaded
    if (row.original.numChildrenClusters > 0) {
      row.toggleExpanded();
    }
  }, []);

  return (
    <div className="flex overflow-hidden px-4 pb-6">
      <InfiniteDataTable<PatternRow>
        className="w-full"
        columns={columns}
        data={patterns}
        getRowId={(pattern) => get(pattern, ["clusterId"], pattern.clusterId)}
        onRowClick={handleRowClick}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        error={error}
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={patternsTableFilters} />
          <ColumnsMenu />
          <DataTableSearch searchColumns={["name"]} placeholder="Search by pattern name..." />
          <RefreshButton onClick={refetch} variant="outline" />
        </div>
        <DataTableFilterList />
      </InfiniteDataTable>
    </div>
  );
}
