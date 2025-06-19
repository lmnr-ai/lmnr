import { ColumnDef } from "@tanstack/react-table";
import { flow } from "lodash";
import { ArrowRight } from "lucide-react";

import {
  calculateDuration,
  calculatePercentageChange,
  calculateTotalCost,
  createHeatmapStyle,
  DisplayValue,
  formatCost,
  formatCostIntl,
  formatScoreValue,
  isValidScore,
  ScoreRanges,
  ScoreValue,
  shouldShowHeatmap,
} from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";
import { EvaluationDatapointPreviewWithCompared } from "@/lib/evaluation/types";
import { getDurationString } from "@/lib/utils";

const shouldShowComparisonIndicator = (originalValue?: number, comparisonValue?: number): boolean =>
  isValidScore(originalValue) &&
  isValidScore(comparisonValue) &&
  originalValue !== comparisonValue &&
  comparisonValue !== 0;

const ComparisonIndicator = ({
  originalValue,
  comparisonValue,
}: {
  originalValue: number;
  comparisonValue: number;
}) => (
  <span className="text-secondary-foreground">
    {originalValue >= comparisonValue ? "▲" : "▼"}({calculatePercentageChange(originalValue, comparisonValue)}%)
  </span>
);

const ComparisonCell = ({
  original,
  comparison,
  originalValue,
  comparisonValue,
}: {
  original: DisplayValue;
  comparison: DisplayValue;
  originalValue?: number;
  comparisonValue?: number;
}) => {
  const showComparison = shouldShowComparisonIndicator(originalValue, comparisonValue);

  return (
    <div className="flex items-center space-x-2">
      <div className="text-green-300">{comparison}</div>
      <ArrowRight className="font-bold min-w-3" size={12} />
      <div className="text-blue-300">{original}</div>
      {showComparison && originalValue && comparisonValue && (
        <ComparisonIndicator originalValue={originalValue} comparisonValue={comparisonValue} />
      )}
    </div>
  );
};

const ScoreDisplay = (range: ScoreRange, value: ScoreValue) => {
  if (!isValidScore(value)) {
    return <span className="text-gray-500">-</span>;
  }

  const style = createHeatmapStyle(value, range);
  const formattedValue = formatScoreValue(value);

  if (style.background === "transparent") {
    return (
      <span className="text-current" title={value.toString()}>
        {formattedValue}
      </span>
    );
  }

  return (
    <div
      className="px-1 py-0.5 min-w-5 rounded text-center transition-all duration-200 whitespace-nowrap text-xs"
      style={style}
      title={value.toString()}
    >
      {formattedValue}
    </div>
  );
};

const HeatmapScoreCell = ({ value, range }: { value: ScoreValue; range: ScoreRange }) => ScoreDisplay(range, value);

const ComparisonScoreValue = ({
  value,
  displayValue,
  range,
}: {
  value: ScoreValue;
  displayValue: DisplayValue;
  range: ScoreRange;
}) => {
  if (!isValidScore(value)) {
    return <span className="text-gray-500 text-center block text-xs">-</span>;
  }

  return ScoreDisplay(range, value);
};

const ChangeIndicator = ({ originalValue, comparisonValue }: { originalValue: number; comparisonValue: number }) => (
  <div className="flex-shrink-0 ml-1">
    <span className="text-xs">
      {originalValue >= comparisonValue ? (
        <span className="text-green-300">▲</span>
      ) : (
        <span className="text-destructive">▼</span>
      )}
      <span className={originalValue >= comparisonValue ? "text-green-300" : "text-destructive"}>
        ({calculatePercentageChange(originalValue, comparisonValue)}%)
      </span>
    </span>
  </div>
);

const HeatmapComparisonCell = ({
  original,
  comparison,
  originalValue,
  comparisonValue,
  range,
}: {
  original: DisplayValue;
  comparison: DisplayValue;
  originalValue?: number;
  comparisonValue?: number;
  range: ScoreRange;
}) => {
  const showComparison = shouldShowComparisonIndicator(originalValue, comparisonValue);
  const showHeatmap = shouldShowHeatmap(range);

  if (!showHeatmap) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-current">{comparison ?? "-"}</span>
        <ArrowRight className="font-bold min-w-3 text-gray-400" size={12} />
        <span className="text-current">{original ?? "-"}</span>
        {showComparison && isValidScore(originalValue) && isValidScore(comparisonValue) && (
          <span className="text-secondary-foreground">
            {originalValue >= comparisonValue ? "▲" : "▼"} ({calculatePercentageChange(originalValue, comparisonValue)}
            %)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-1 w-full min-w-0">
      <div className="flex-1 min-w-fit">
        <ComparisonScoreValue value={comparisonValue} displayValue={comparison} range={range} />
      </div>

      <ArrowRight className="font-bold text-gray-400 flex-shrink-0" size={8} />

      <div className="flex-1 min-w-fit">
        <ComparisonScoreValue value={originalValue} displayValue={original} range={range} />
      </div>

      {showComparison && isValidScore(originalValue) && isValidScore(comparisonValue) && (
        <ChangeIndicator originalValue={originalValue} comparisonValue={comparisonValue} />
      )}
    </div>
  );
};

const createDurationCell = (row: EvaluationDatapointPreviewWithCompared) => {
  const comparison =
    row.comparedStartTime && row.comparedEndTime ? getDurationString(row.comparedStartTime, row.comparedEndTime) : "-";

  const comparisonValue =
    row.comparedStartTime && row.comparedEndTime
      ? calculateDuration(row.comparedStartTime, row.comparedEndTime)
      : undefined;

  return (
    <ComparisonCell
      original={getDurationString(row.startTime, row.endTime)}
      comparison={comparison}
      originalValue={calculateDuration(row.startTime, row.endTime)}
      comparisonValue={comparisonValue}
    />
  );
};

const createCostCell = (row: EvaluationDatapointPreviewWithCompared) => {
  const comparison =
    row.comparedInputCost && row.comparedOutputCost
      ? formatCost(calculateTotalCost(row.comparedInputCost, row.comparedOutputCost))
      : "-";

  const comparisonValue =
    row.comparedInputCost && row.comparedOutputCost
      ? calculateTotalCost(row.comparedInputCost, row.comparedOutputCost)
      : undefined;

  return (
    <ComparisonCell
      original={formatCost(calculateTotalCost(row.inputCost, row.outputCost))}
      comparison={comparison}
      originalValue={calculateTotalCost(row.inputCost, row.outputCost)}
      comparisonValue={comparisonValue}
    />
  );
};

const createStandardScoreComparison = (original: ScoreValue, comparison: ScoreValue) => {
  const showComparison = shouldShowComparisonIndicator(original, comparison);

  return (
    <div className="flex items-center space-x-2">
      <div title={String(comparison)} className="text-green-300">
        {isValidScore(comparison) ? formatScoreValue(comparison) : "-"}
      </div>
      <ArrowRight className="font-bold min-w-3" size={12} />
      <div title={String(original)} className="text-blue-300">
        {isValidScore(original) ? formatScoreValue(original) : "-"}
      </div>
      {showComparison && isValidScore(original) && isValidScore(comparison) && (
        <span className="text-secondary-foreground">
          {original >= comparison ? "▲" : "▼"} ({calculatePercentageChange(original, comparison)}%)
        </span>
      )}
    </div>
  );
};

const createScoreColumnCell = (heatmapEnabled: boolean, scoreRanges: ScoreRanges, scoreName: string) => {
  const ScoreColumnCell = ({ row }: { row: { original: EvaluationDatapointPreviewWithCompared } }) => {
    const value = row.original.scores?.[scoreName];
    const range = scoreRanges[scoreName];

    if (heatmapEnabled && range) {
      return <HeatmapScoreCell value={value} range={range} />;
    }

    return value ?? "-";
  };

  ScoreColumnCell.displayName = `ScoreColumnCell_${scoreName}`;
  return ScoreColumnCell;
};

const createComparisonScoreColumnCell = (heatmapEnabled: boolean, scoreRanges: ScoreRanges, scoreName: string) => {
  const ComparisonScoreColumnCell = ({ row }: { row: { original: EvaluationDatapointPreviewWithCompared } }) => {
    const original = row.original.scores?.[scoreName];
    const comparison = row.original.comparedScores?.[scoreName];
    const range = scoreRanges[scoreName];

    if (heatmapEnabled && range) {
      return (
        <HeatmapComparisonCell
          original={isValidScore(original) ? formatScoreValue(original) : "-"}
          comparison={isValidScore(comparison) ? formatScoreValue(comparison) : "-"}
          originalValue={original}
          comparisonValue={comparison}
          range={range}
        />
      );
    }

    return createStandardScoreComparison(original, comparison);
  };

  ComparisonScoreColumnCell.displayName = `ComparisonScoreColumnCell_${scoreName}`;
  return ComparisonScoreColumnCell;
};

const createColumnSizeConfig = (heatmapEnabled: boolean, isComparison: boolean = false) => ({
  size: heatmapEnabled ? (isComparison ? 140 : 100) : undefined,
  minSize: heatmapEnabled ? (isComparison ? 140 : 100) : isComparison ? 80 : 60,
});

export const defaultColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    accessorKey: "index",
    header: "Index",
    size: 70,
  },
  {
    accessorFn: flow((row: EvaluationDatapointPreviewWithCompared) => row.data, JSON.stringify),
    header: "Data",
  },
  {
    accessorFn: flow(
      (row: EvaluationDatapointPreviewWithCompared) => row.target,
      (target) => (target ? JSON.stringify(target) : "-")
    ),
    header: "Target",
  },
  {
    accessorFn: flow(
      (row: EvaluationDatapointPreviewWithCompared) => row.metadata,
      (metadata) => (metadata ? JSON.stringify(metadata) : "-")
    ),
    header: "Metadata",
  },
];

export const comparedComplementaryColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    cell: flow((cellContext) => cellContext.row.original, createDurationCell),
    header: "Duration",
  },
  {
    cell: flow((cellContext) => cellContext.row.original, createCostCell),
    header: "Cost",
  },
];

export const complementaryColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    accessorFn: flow(
      (row: EvaluationDatapointPreviewWithCompared) => row.executorOutput,
      (output) => (output ? JSON.stringify(output) : "-")
    ),
    header: "Output",
  },
  {
    accessorFn: (row: EvaluationDatapointPreviewWithCompared) => getDurationString(row.startTime, row.endTime),
    header: "Duration",
  },
  {
    accessorFn: flow(
      (row: EvaluationDatapointPreviewWithCompared) => calculateTotalCost(row.inputCost, row.outputCost),
      formatCostIntl
    ),
    header: "Cost",
  },
];

export const getComparedScoreColumns = (
  scores: string[],
  heatmapEnabled: boolean = false,
  scoreRanges: ScoreRanges = {}
): ColumnDef<EvaluationDatapointPreviewWithCompared>[] =>
  scores.map((name) => ({
    header: name,
    ...createColumnSizeConfig(heatmapEnabled, true),
    cell: createComparisonScoreColumnCell(heatmapEnabled, scoreRanges, name),
  }));

export const getScoreColumns = (
  scores: string[],
  heatmapEnabled: boolean = false,
  scoreRanges: ScoreRanges = {}
): ColumnDef<EvaluationDatapointPreviewWithCompared>[] =>
  scores.map((name) => ({
    header: name,
    ...createColumnSizeConfig(heatmapEnabled, false),
    cell: createScoreColumnCell(heatmapEnabled, scoreRanges, name),
  }));
