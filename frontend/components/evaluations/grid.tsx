"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { memo, type MutableRefObject, type ReactNode, useCallback, useEffect, useRef } from "react";

import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { type Evaluation } from "@/lib/evaluation/types";
import { useToast } from "@/lib/hooks/use-toast";

import { FETCH_SIZE } from "./constants";

export interface EvaluationsGridProps {
  chrome: ReactNode;
  filter: string[];
  search: string | null;
  groupId: string | null;
  isViewLoading: boolean;
  isGroupDefaultPending: boolean;
  columns: ColumnDef<Evaluation>[];
  hiddenEvaluationIds: string[];
  rowSelection: Record<string, boolean>;
  onRowSelectionChange: (
    v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  onHoveredRowChange: (id: string | undefined) => void;
  refetchRef: MutableRefObject<() => void>;
  onEvaluationsChange: (evals: { id: string; name: string }[]) => void;
}

export const EvaluationsGrid = memo(function EvaluationsGrid({
  chrome,
  filter,
  search,
  groupId,
  isViewLoading,
  isGroupDefaultPending,
  columns,
  hiddenEvaluationIds,
  rowSelection,
  onRowSelectionChange,
  onHoveredRowChange,
  refetchRef,
  onEvaluationsChange,
}: EvaluationsGridProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const fetchEvaluations = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (groupId) urlParams.set("groupId", groupId);
        if (search && search.trim() !== "") urlParams.set("search", search);
        filter.forEach((f) => urlParams.append("filter", f));

        const res = await fetch(`/api/projects/${projectId}/evaluations?${urlParams.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: Evaluation[]; totalCount: number };
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load evaluations. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [filter, groupId, projectId, search, toast]
  );

  const {
    data: evaluations,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<Evaluation>({
    fetchFn: fetchEvaluations,
    enabled: !isViewLoading && !isGroupDefaultPending,
    deps: [filter, groupId, projectId, search],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  // Notify parent of the evaluation list only when the query changes, not on pagination,
  // so the chart above doesn't re-render as the user scrolls.
  const queryKeyRef = useRef("");
  const currentQueryKey = `${groupId ?? ""}:${filter.join(",")}:${search ?? ""}`;
  useEffect(() => {
    if (evaluations.length === 0) return;
    if (currentQueryKey !== queryKeyRef.current) {
      queryKeyRef.current = currentQueryKey;
      onEvaluationsChange(evaluations.map(({ id, name }) => ({ id, name })));
    }
  }, [evaluations, currentQueryKey, onEvaluationsChange]);

  const handleDeleteEvaluations = useCallback(
    async (evaluationIds: string[]) => {
      try {
        const response = await fetch(`/api/projects/${projectId}/evaluations`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluationIds }),
        });

        if (response.ok) {
          await refetch();
          toast({
            title: "Evaluations deleted",
            description: `Successfully deleted ${evaluationIds.length} evaluation(s).`,
          });
        } else {
          throw new Error("Failed to delete evaluations");
        }
      } catch {
        toast({
          title: "Error",
          description: "Failed to delete evaluations. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, refetch, toast]
  );

  return (
    <InfiniteDataTable<Evaluation>
      className="w-full"
      enableRowSelection
      columns={columns}
      data={evaluations}
      getRowId={(evaluation) => evaluation.id}
      getRowHref={(row) => `/project/${projectId}/evaluations/${row.original.id}`}
      getRowClassName={(row) => (hiddenEvaluationIds.includes(row.original.id) ? "opacity-40" : "")}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading || isGroupDefaultPending}
      fetchNextPage={fetchNextPage}
      state={{ rowSelection }}
      onRowSelectionChange={onRowSelectionChange}
      onHoveredRowChange={(row) => onHoveredRowChange(row?.original.id)}
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows
            selectedRowIds={selectedRowIds}
            onDelete={handleDeleteEvaluations}
            entityName="evaluations"
          />
        </div>
      )}
    >
      {chrome}
    </InfiniteDataTable>
  );
});
