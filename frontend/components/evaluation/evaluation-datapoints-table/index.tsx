import { type Row } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";

import { selectVisibleColumns, useEvalStore } from "@/components/evaluation/store";
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

const EvaluationDatapointsTable = (props: EvaluationDatapointsTableProps) => {
  const { isLoading } = props;
  const visibleColumns = useEvalStore(useShallow(selectVisibleColumns));

  if (isLoading) {
    return <EvalTableSkeleton />;
  }

  return (
    <DataTableStateProvider storageKey="evaluation-datapoints-table" columns={visibleColumns}>
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
