import { type Row } from "@tanstack/react-table";

import { buildEvalColumnDefs, buildEvalCustomColumnDef, useEvalStore } from "@/components/evaluation/store";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { type EvalRow } from "@/lib/evaluation/types";

import EvalTableSkeleton from "./eval-table-skeleton";
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
  const isShared = useEvalStore((s) => s.isShared);

  // Delay mounting the store until scores are known, otherwise the store
  // is created with an incomplete defaultColumnOrder and score columns
  // won't be reorderable.
  if (isLoading) {
    return <EvalTableSkeleton />;
  }

  const defaultColumnOrder = [...baseColumnOrder, ...scores.map((s) => `score:${s}`)];

  return (
    <DataTableStateProvider<EvalRow>
      storageKey="evaluation-datapoints-table"
      defaultColumnOrder={defaultColumnOrder}
      initialColumnDefs={buildEvalColumnDefs(scores, [], isShared)}
      buildCustomColumnDef={buildEvalCustomColumnDef}
      enableCustomColumns={!isShared}
    >
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
