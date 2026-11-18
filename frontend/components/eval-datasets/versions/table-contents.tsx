"use client";

import { memo, useCallback, useMemo } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { type EvalDatasetVersionItem } from "@/lib/actions/eval-datasets/types";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";
import { type PaginatedResponse } from "@/lib/types";

import { evalDatasetVersionHref, FETCH_SIZE } from "../constants";
import { versionsColumns } from "./columns";

interface VersionsTableContentsProps {
  projectId: string;
  dataset: string;
}

export const VersionsTableContents = memo(function VersionsTableContents({
  projectId,
  dataset,
}: VersionsTableContentsProps) {
  const { toast } = useToast();
  const columns = useMemo(() => versionsColumns(projectId, dataset), [projectId, dataset]);

  const fetchVersions = useCallback(
    async (pageNumber: number) => {
      const { data, error } = await fetchApi<PaginatedResponse<EvalDatasetVersionItem>>(
        `/api/projects/${projectId}/eval-datasets/${encodeURIComponent(dataset)}/versions?pageNumber=${pageNumber}&pageSize=${FETCH_SIZE}`
      );
      if (error !== null) {
        toast({ variant: "destructive", title: error });
        throw new Error(error);
      }
      return { items: data.items, count: data.totalCount };
    },
    [projectId, dataset, toast]
  );

  const { data, hasMore, isFetching, isLoading, fetchNextPage } = useInfiniteScroll<EvalDatasetVersionItem>({
    fetchFn: fetchVersions,
    deps: [projectId, dataset],
  });

  return (
    <InfiniteDataTable<EvalDatasetVersionItem>
      className="w-full"
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      getRowHref={(row) => evalDatasetVersionHref(projectId, dataset, row.original.version)}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
    />
  );
});
