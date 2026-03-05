import { type Row } from "@tanstack/react-table";
import { type DependencyList, useMemo } from "react";

import { useEvalStore } from "@/components/evaluation/store";
import { type FetchResult } from "@/components/ui/infinite-datatable/hooks/use-infinite-scroll";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { type EvalRow } from "@/lib/evaluation/types";

import EvalTableSkeleton from "./eval-table-skeleton";
import EvaluationDatapointsTableContent from "./evaluation-datapoints-table-content";

export interface EvaluationDatapointsTableProps {
  isStatsLoading: boolean;
  datapointId?: string;
  scores: string[];
  handleRowClick: (row: Row<EvalRow>) => void;
  getRowHref?: (row: Row<EvalRow>) => string;
  fetchFn: (pageNumber: number) => Promise<FetchResult<EvalRow>>;
  fetchDeps: DependencyList;
}

const baseColumnOrder = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];

const EvaluationDatapointsTable = (props: EvaluationDatapointsTableProps) => {
  const { scores, isStatsLoading } = props;
  const customColumns = useEvalStore((s) => s.customColumns);
  const defaultColumnOrder = useMemo(
    () => [...baseColumnOrder, ...scores.map((s) => `score:${s}`), ...customColumns.map((cc) => `custom:${cc.name}`)],
    [scores, customColumns]
  );

  if (isStatsLoading) {
    return <EvalTableSkeleton />;
  }

  return (
    <DataTableStateProvider storageKey="evaluation-datapoints-table" defaultColumnOrder={defaultColumnOrder}>
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
