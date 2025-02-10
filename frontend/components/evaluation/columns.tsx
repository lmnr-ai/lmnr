import { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";

import { EvaluationDatapointPreviewWithCompared } from "@/lib/evaluation/types";
import { getDurationString } from "@/lib/flow/utils";

const ComparisonCell = ({ original, comparison }: { original: string | number; comparison: string | number }) => (
  <div className="flex flex-row items-center space-x-2">
    <div className="text-green-300">{original}</div>
    <ArrowRight className="font-bold min-w-3" size={12} />
    <div className="text-blue-300">{comparison}</div>
  </div>
);

export const defaultColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    accessorKey: "index",
    header: "Index",
  },
  {
    accessorFn: (row) => JSON.stringify(row.data),
    header: "Data",
  },
  {
    accessorFn: (row) => (row.target ? JSON.stringify(row.target) : "-"),
    header: "Target",
  },
];

export const comparedComplementaryColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    cell: ({ row }) => {
      const comparison =
        row.original.comparedStartTime && row.original.comparedEndTime
          ? getDurationString(row.original.comparedStartTime, row.original.comparedEndTime)
          : "-";

      return (
        <ComparisonCell
          original={getDurationString(row.original.startTime, row.original.endTime)}
          comparison={comparison}
        />
      );
    },
    header: "Duration",
  },
  {
    cell: ({ row }) => {
      const comparison =
        row.original.comparedInputCost && row.original.comparedOutputCost
          ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumSignificantDigits: 5,
          }).format(row.original.comparedInputCost + row.original.comparedOutputCost)
          : "-";

      return (
        <ComparisonCell
          original={new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumSignificantDigits: 5,
          }).format(row.original.inputCost + row.original.inputCost)}
          comparison={comparison}
        />
      );
    },
    header: "Cost",
  },
];
export const complementaryColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    accessorFn: (row) => (row.executorOutput ? JSON.stringify(row.executorOutput) : "-"),
    header: "Output",
  },
  {
    accessorFn: (row) => getDurationString(row.startTime, row.endTime),
    header: "Duration",
  },
  {
    accessorFn: (row) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 5 }).format(
        row.inputCost + row.outputCost
      ),
    header: "Cost",
  },
];

export const getScoreColumns = (scores: string[]): ColumnDef<EvaluationDatapointPreviewWithCompared>[] =>
  scores.map((name) => ({
    header: name,
    cell: ({ row }) => (
      <ComparisonCell
        original={row.original.scores?.[name] ?? "-"}
        comparison={row.original.comparedScores?.[name] ?? "-"}
      />
    ),
  }));
