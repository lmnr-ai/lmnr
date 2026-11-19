"use client";

import { memo, type PropsWithChildren, useCallback } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { TableCell, TableRow } from "@/components/ui/table";
import { type EvalDatasetSummary } from "@/lib/actions/eval-datasets/types";
import { nameToPath } from "@/lib/evaluation/trial-files";

import { evalDatasetsColumns } from "./columns";
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

const noop = () => {};
const getRowId = (row: EvalDatasetSummary) => row.id;

interface EvalDatasetsTableContentsProps {
  projectId: string;
  datasets: EvalDatasetSummary[];
  isLoading: boolean;
  error: string | null;
  isSearching: boolean;
}

export const EvalDatasetsTableContents = memo(function EvalDatasetsTableContents({
  children,
  projectId,
  datasets,
  isLoading,
  error,
  isSearching,
}: PropsWithChildren<EvalDatasetsTableContentsProps>) {
  const getRowHref = useCallback(
    (row: { original: EvalDatasetSummary }) => `/project/${projectId}/eval-datasets/${nameToPath(row.original.id)}`,
    [projectId]
  );

  return (
    <InfiniteDataTable<EvalDatasetSummary>
      className="w-full"
      columns={evalDatasetsColumns}
      data={datasets}
      getRowId={getRowId}
      getRowHref={getRowHref}
      hasMore={false}
      isFetching={false}
      isLoading={isLoading}
      fetchNextPage={noop}
      emptyRow={error ? <MessageRow>{error}</MessageRow> : isSearching ? NoMatchesRow : EmptyRow}
    >
      {children}
    </InfiniteDataTable>
  );
});
