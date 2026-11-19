"use client";

import { memo, type PropsWithChildren, useCallback } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { type EvalDatasetTaskItem } from "@/lib/actions/eval-datasets/types";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";
import { type PaginatedResponse } from "@/lib/types";

import { evalDatasetApi, FETCH_SIZE } from "../../constants";
import { tasksColumns } from "./columns";

interface TasksTableContentsProps {
  projectId: string;
  dataset: string;
  search: string;
  selected: string | null;
  onSelect: (task: string) => void;
}

export const TasksTableContents = memo(function TasksTableContents({
  projectId,
  dataset,
  search,
  selected,
  onSelect,
  children,
}: PropsWithChildren<TasksTableContentsProps>) {
  const { toast } = useToast();

  const fetchTasks = useCallback(
    async (pageNumber: number) => {
      const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(FETCH_SIZE) });
      if (search) params.set("search", search);
      const { data, error } = await fetchApi<PaginatedResponse<EvalDatasetTaskItem>>(
        `${evalDatasetApi(projectId, dataset)}/tasks?${params}`
      );
      if (error !== null) {
        toast({ variant: "destructive", title: error });
        throw new Error(error);
      }
      return { items: data.items, count: data.totalCount };
    },
    [projectId, dataset, search, toast]
  );

  const { data, hasMore, isFetching, isLoading, fetchNextPage } = useInfiniteScroll<EvalDatasetTaskItem>({
    fetchFn: fetchTasks,
    deps: [projectId, dataset, search],
  });

  return (
    <InfiniteDataTable<EvalDatasetTaskItem>
      className="w-full"
      columns={tasksColumns}
      data={data}
      getRowId={(row) => row.name}
      onRowClick={(row) => onSelect(row.original.name)}
      focusedRowId={selected}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
    >
      {children}
    </InfiniteDataTable>
  );
});
