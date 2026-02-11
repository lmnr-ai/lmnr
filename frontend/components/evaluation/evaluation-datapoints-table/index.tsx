import { type Row } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
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
  const defaultColumnOrder = useMemo(
    () => [...baseColumnOrder, ...scores.flatMap((s) => [`score:${s}`, `comparedScore:${s}`])],
    [scores]
  );

  // Delay mounting the store until scores are known, otherwise the store
  // is created with an incomplete defaultColumnOrder and score columns
  // won't be reorderable.
  if (isLoading) {
    return null;
  }

  return (
    <DataTableStateProvider storageKey="evaluation-datapoints-table" defaultColumnOrder={defaultColumnOrder}>
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
