import { type Row } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvalRow } from "@/lib/evaluation/types";

import EvaluationDatapointsTableContent from "./evaluation-datapoints-table-content";

export interface EvaluationDatapointsTableProps {
  isLoading: boolean;
  datapointId?: string;
  data: EvalRow[] | undefined;
  scores: string[];
  handleRowClick: (row: Row<EvalRow>) => void;
  getRowHref?: (row: Row<EvalRow>) => string;
  hasMore: boolean;
  isFetching: boolean;
  fetchNextPage: () => void;
}

const baseColumnOrder = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];

const EvaluationDatapointsTable = (props: EvaluationDatapointsTableProps) => {
  const { scores, isLoading } = props;
  const defaultColumnOrder = useMemo(() => [...baseColumnOrder, ...scores.map((s) => `score:${s}`)], [scores]);

  // Delay mounting the store until scores are known, otherwise the store
  // is created with an incomplete defaultColumnOrder and score columns
  // won't be reorderable.
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 overflow-hidden">
        <div className="flex space-x-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-7" />
          <Skeleton className="h-7 flex-1" />
        </div>
        <div className="flex flex-col gap-2 p-2 border rounded bg-secondary flex-1">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  return (
    <DataTableStateProvider storageKey="evaluation-datapoints-table" defaultColumnOrder={defaultColumnOrder}>
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
