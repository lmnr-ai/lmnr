"use client";

import { type Row } from "@tanstack/react-table";
import { memo, type PropsWithChildren, useCallback } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { type EvalTaskSummary } from "@/lib/actions/eval-datasets/types";
import { nameToPath } from "@/lib/evaluation/trial-files";
import { useToast } from "@/lib/hooks/use-toast";

import { fetchPage } from "../list-query";
import MessageRow from "../message-row";
import { taskColumns } from "./columns";

const getRowId = (row: EvalTaskSummary) => row.id;

const NoMatchesRow = <MessageRow>No tasks match your search.</MessageRow>;

interface TasksTableContentsProps {
  projectId: string;
  datasetId: string;
  filter: string[];
  search: string | null;
  isViewLoading: boolean;
  /** The dataset's own error (e.g. not found), shown in place of rows. */
  datasetError: string | null;
  focusedRowId: string | null;
  onRowClick: (row: Row<EvalTaskSummary>) => void;
}

export const TasksTableContents = memo(function TasksTableContents({
  children,
  projectId,
  datasetId,
  filter,
  search,
  isViewLoading,
  datasetError,
  focusedRowId,
  onRowClick,
}: PropsWithChildren<TasksTableContentsProps>) {
  const { toast } = useToast();
  const fetchTasks = useCallback(
    (pageNumber: number) =>
      fetchPage<EvalTaskSummary>(
        `/api/projects/${projectId}/eval-datasets/${nameToPath(datasetId)}/tasks`,
        pageNumber,
        filter,
        search
      ).catch((error: Error) => {
        toast({ title: error.message, variant: "destructive" });
        throw error;
      }),
    [projectId, datasetId, filter, search, toast]
  );
  const { data, hasMore, isFetching, isLoading, error, fetchNextPage } = useInfiniteScroll<EvalTaskSummary>({
    fetchFn: fetchTasks,
    enabled: !isViewLoading,
    deps: [projectId, datasetId, filter, search],
  });
  const message = datasetError ?? error?.message;

  return (
    <InfiniteDataTable<EvalTaskSummary>
      className="w-full"
      columns={taskColumns}
      data={data}
      getRowId={getRowId}
      focusedRowId={focusedRowId}
      onRowClick={onRowClick}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading}
      fetchNextPage={fetchNextPage}
      emptyRow={message ? <MessageRow>{message}</MessageRow> : NoMatchesRow}
    >
      {children}
    </InfiniteDataTable>
  );
});
