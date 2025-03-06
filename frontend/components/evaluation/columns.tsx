import { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";

import { EvaluationDatapointPreviewWithCompared } from "@/lib/evaluation/types";
import { getDurationString } from "@/lib/flow/utils";
import { isValidNumber } from "@/lib/utils";

const getPercentageChange = (original: number, compared: number) =>
  (((original - compared) / compared) * 100).toFixed(2);

const ComparisonCell = ({
  original,
  comparison,
  originalValue,
  comparisonValue,
}: {
  original: string | number;
  comparison: string | number;
  originalValue?: number;
  comparisonValue?: number;
}) => {
  const shouldShowComparison =
    isValidNumber(originalValue) &&
    isValidNumber(comparisonValue) &&
    originalValue !== comparisonValue &&
    comparisonValue !== 0;

  return (
    <div className="flex items-center space-x-2">
      <div className="text-green-300">{comparison}</div>
      <ArrowRight className="font-bold min-w-3" size={12} />
      <div className="text-blue-300">{original}</div>
      {shouldShowComparison && (
        <span className="text-secondary-foreground">
          {originalValue >= comparisonValue ? "▲" : "▼"} ({getPercentageChange(originalValue, comparisonValue)}%)
        </span>
      )}
    </div>
  );
};

export const defaultColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    accessorKey: "index",
    header: "Index",
    size: 70,
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

      const comparisonValue =
        row.original.comparedEndTime && row.original.comparedStartTime
          ? (new Date(row.original.comparedEndTime).getTime() - new Date(row.original.comparedStartTime).getTime()) /
            1000
          : undefined;

      return (
        <ComparisonCell
          original={getDurationString(row.original.startTime, row.original.endTime)}
          comparison={comparison}
          originalValue={(new Date(row.original.endTime).getTime() - new Date(row.original.startTime).getTime()) / 1000}
          comparisonValue={comparisonValue}
        />
      );
    },
    header: "Duration",
  },
  {
    cell: ({ row }) => {
      const comparison =
        row.original.comparedInputCost && row.original.comparedOutputCost
          ? `${(row.original.comparedInputCost + row.original.comparedOutputCost).toFixed(5)}$`
          : "-";

      const comparisonValue =
        row.original.comparedInputCost && row.original.comparedOutputCost
          ? Number((row.original.comparedInputCost + row.original.comparedOutputCost).toFixed(5))
          : undefined;

      return (
        <ComparisonCell
          original={`${(row.original.inputCost + row.original.outputCost).toFixed(5)}$`}
          comparison={comparison}
          originalValue={Number((row.original.inputCost + row.original.outputCost).toFixed(5))}
          comparisonValue={comparisonValue}
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

export const getComparedScoreColumns = (scores: string[]): ColumnDef<EvaluationDatapointPreviewWithCompared>[] =>
  scores.map((name) => ({
    header: name,
    cell: ({ row }) => {
      const original = row.original.scores?.[name];
      const comparison = row.original.comparedScores?.[name];
      const shouldShowComparison = isValidNumber(original) && isValidNumber(comparison) && original !== comparison;

      return (
        <div className="flex items-center space-x-2">
          <div className="text-green-300">{comparison ?? "-"}</div>
          <ArrowRight className="font-bold min-w-3" size={12} />
          <div className="text-blue-300">{original ?? "-"}</div>
          {shouldShowComparison && (
            <span className="text-secondary-foreground">
              {original >= comparison ? "▲" : "▼"} ({original - comparison})
            </span>
          )}
        </div>
      );
    },
  }));

export const getScoreColumns = (scores: string[]): ColumnDef<EvaluationDatapointPreviewWithCompared>[] =>
  scores.map((name) => ({
    header: name,
    cell: ({ row }) => row.original.scores?.[name],
  }));
