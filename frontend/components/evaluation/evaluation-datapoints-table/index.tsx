import { useMemo, useState } from "react";

import { consumeLegacyEvalCustomColumns, useEvalStore } from "@/components/evaluation/store";
import { type CustomColumn } from "@/components/ui/columns-menu";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";

import EvaluationDatapointsTableContent, {
  type EvaluationDatapointsTableContentProps,
} from "./evaluation-datapoints-table-content";

export interface EvaluationDatapointsTableProps extends EvaluationDatapointsTableContentProps {
  /** Server-seeded score names. Used to compute the initial column order. */
  initialScoreNames: string[];
  /** Storage key for column persistence. Use a different key for shared eval to
   * avoid customColumns leaking from a non-shared session into the shared view. */
  storageKey?: string;
}

const baseColumnOrder = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];

const EvaluationDatapointsTable = ({
  storageKey = "evaluation-datapoints-table",
  ...props
}: EvaluationDatapointsTableProps) => {
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const isShared = useEvalStore((s) => s.isShared);
  const defaultColumnOrder = useMemo(
    () => [...baseColumnOrder, ...scoreNames.map((s) => `score:${s}`)],
    [scoreNames]
  );

  // One-shot migration: drain customColumns from the legacy "evaluation-store"
  // localStorage blob into the non-shared DataTableStore. Shared eval skips
  // this — its column store is browser-isolated by storageKey already.
  const [seedCustomColumns] = useState<CustomColumn[]>(() =>
    isShared ? [] : consumeLegacyEvalCustomColumns()
  );

  return (
    <DataTableStateProvider
      storageKey={storageKey}
      defaultColumnOrder={defaultColumnOrder}
      initialColumnConfig={seedCustomColumns.length > 0 ? { customColumns: seedCustomColumns } : undefined}
    >
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
