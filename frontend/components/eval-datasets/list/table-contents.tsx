"use client";

import { memo, useCallback } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { type EvalDatasetListItem } from "@/lib/actions/eval-datasets/types";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";
import { type PaginatedResponse } from "@/lib/types";

import { evalDatasetHref, FETCH_SIZE } from "../constants";
import { evalDatasetsColumns } from "./columns";
import EvalDatasetsEmptyRow from "./empty-row";

export const EvalDatasetsTableContents = memo(function EvalDatasetsTableContents({ projectId }: { projectId: string }) {
  const { toast } = useToast();

  const fetchDatasets = useCallback(
    async (pageNumber: number) => {
      const { data, error } = await fetchApi<PaginatedResponse<EvalDatasetListItem>>(
        `/api/projects/${projectId}/eval-datasets?pageNumber=${pageNumber}&pageSize=${FETCH_SIZE}`
      );
      if (error !== null) {
        toast({ variant: "destructive", title: error });
        throw new Error(error);
      }
      return { items: data.items, count: data.totalCount };
    },
    [projectId, toast]
  );

  const { data, hasMore, isFetching, isLoading, fetchNextPage } = useInfiniteScroll<EvalDatasetListItem>({
    fetchFn: fetchDatasets,
    deps: [projectId],
  });

  return (
    <InfiniteDataTable<EvalDatasetListItem>
      className="w-full"
      columns={evalDatasetsColumns}
      data={data}
      getRowId={(row) => row.name}
      getRowHref={(row) => evalDatasetHref(projectId, row.original.name)}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
      emptyRow={<EvalDatasetsEmptyRow />}
    />
  );
});
