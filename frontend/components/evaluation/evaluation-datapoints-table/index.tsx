import { type Row } from "@tanstack/react-table";
import { useMemo } from "react";

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

const EvaluationDatapointsTable = (props: EvaluationDatapointsTableProps) => {
  const { isLoading, scores } = props;
  const isShared = useEvalStore((s) => s.isShared);

  const columnDefs = useMemo(() => buildEvalColumnDefs(scores), [scores]);

  if (isLoading) {
    return <EvalTableSkeleton />;
  }

  return (
    <DataTableStateProvider
      storageKey="evaluation-datapoints-table"
      columnDefs={columnDefs}
      buildCustomColumnDef={isShared ? undefined : buildEvalCustomColumnDef}
    >
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
