"use client";

import { memo, type PropsWithChildren, useCallback } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { type EvalDatasetSummary } from "@/lib/actions/eval-datasets/types";
import { nameToPath } from "@/lib/evaluation/trial-files";
import { useToast } from "@/lib/hooks/use-toast";

import { evalDatasetsColumns } from "./columns";
import { fetchPage } from "./list-query";
import MessageRow from "./message-row";

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="h-auto w-full rounded-b p-4 text-center">
      <div className="flex flex-1 justify-center">
        <div className="flex max-w-md flex-col items-center gap-2">
          <h3 className="text-base font-medium text-secondary-foreground">No eval datasets yet</h3>
          <p className="text-center text-sm text-muted-foreground">
            An eval dataset is a folder of Harbor tasks under <code>evals/</code>. Push one with{" "}
            <code>npx lmnr-cli eval dataset push</code>, and its task versions show up here.
          </p>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

const NoMatchesRow = <MessageRow>No eval datasets match your search.</MessageRow>;

const getRowId = (row: EvalDatasetSummary) => row.id;

interface EvalDatasetsTableContentsProps {
  projectId: string;
  filter: string[];
  search: string | null;
  isViewLoading: boolean;
  isSearching: boolean;
}

export const EvalDatasetsTableContents = memo(function EvalDatasetsTableContents({
  children,
  projectId,
  filter,
  search,
  isViewLoading,
  isSearching,
}: PropsWithChildren<EvalDatasetsTableContentsProps>) {
  const { toast } = useToast();
  const fetchDatasets = useCallback(
    (pageNumber: number) =>
      fetchPage<EvalDatasetSummary>(`/api/projects/${projectId}/eval-datasets`, pageNumber, filter, search).catch(
        (error: Error) => {
          toast({ title: error.message, variant: "destructive" });
          throw error;
        }
      ),
    [projectId, filter, search, toast]
  );
  const { data, hasMore, isFetching, isLoading, error, fetchNextPage } = useInfiniteScroll<EvalDatasetSummary>({
    fetchFn: fetchDatasets,
    enabled: !isViewLoading,
    deps: [projectId, filter, search],
  });

  const getRowHref = useCallback(
    (row: { original: EvalDatasetSummary }) => `/project/${projectId}/eval-datasets/${nameToPath(row.original.id)}`,
    [projectId]
  );

  return (
    <InfiniteDataTable<EvalDatasetSummary>
      className="w-full"
      columns={evalDatasetsColumns}
      data={data}
      getRowId={getRowId}
      getRowHref={getRowHref}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading}
      fetchNextPage={fetchNextPage}
      emptyRow={error ? <MessageRow>{error.message}</MessageRow> : isSearching ? NoMatchesRow : EmptyRow}
    >
      {children}
    </InfiniteDataTable>
  );
});
