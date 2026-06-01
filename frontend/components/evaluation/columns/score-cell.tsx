import { type CellContext } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";

import HeatmapValue from "@/components/evaluation/heatmap-value";
import {
  calculatePercentageChange,
  DEFAULT_HEATMAP_VARIANT,
  type DisplayValue,
  formatScoreValue,
  type HeatmapVariant,
  isValidScore,
  type ScoreValue,
  shouldShowHeatmap,
} from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";
import { type EvalRow } from "@/lib/evaluation/types";

import { ChangeIndicator, shouldShowComparisonIndicator } from "./comparison-cell";

const ScoreDisplay = ({
  range,
  value,
  variant,
}: {
  range: ScoreRange;
  value: ScoreValue;
  variant: HeatmapVariant;
}) => {
  if (!isValidScore(value)) {
    return <span className="text-gray-500">-</span>;
  }

  return (
    <HeatmapValue
      value={value}
      range={range}
      variant={variant}
      text={
        <span className="text-current" title={value.toString()}>
          {formatScoreValue(value)}
        </span>
      }
    />
  );
};

const HeatmapScoreCell = ({
  value,
  range,
  variant,
}: {
  value: ScoreValue;
  range: ScoreRange;
  variant: HeatmapVariant;
}) => <ScoreDisplay range={range} value={value} variant={variant} />;

// -- Comparison sub-components (absorbed from comparison-score-cell.tsx) --

const ComparisonScoreValue = ({
  value,
  range,
  variant,
}: {
  value: ScoreValue;
  range: ScoreRange;
  variant: HeatmapVariant;
}) => {
  if (!isValidScore(value)) {
    return <span className="text-gray-500 text-center block text-xs">-</span>;
  }

  return <ScoreDisplay range={range} value={value} variant={variant} />;
};

const HeatmapComparisonCell = ({
  original,
  comparison,
  originalValue,
  comparisonValue,
  range,
  variant,
}: {
  original: DisplayValue;
  comparison: DisplayValue;
  originalValue?: number;
  comparisonValue?: number;
  range: ScoreRange;
  variant: HeatmapVariant;
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
            {originalValue >= comparisonValue ? "▲" : "▼"} (
            {calculatePercentageChange(originalValue, comparisonValue)}
            %)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-1 w-full min-w-0">
      <div className="flex-1 min-w-fit">
        <ComparisonScoreValue value={comparisonValue} range={range} variant={variant} />
      </div>
      <ArrowRight className="font-bold text-gray-400 shrink-0" size={8} />
      <div className="flex-1 min-w-fit">
        <ComparisonScoreValue value={originalValue} range={range} variant={variant} />
      </div>
      {showComparison && isValidScore(originalValue) && isValidScore(comparisonValue) && (
        <ChangeIndicator originalValue={originalValue} comparisonValue={comparisonValue} />
      )}
    </div>
  );
};

const StandardScoreComparison = ({ original, comparison }: { original: ScoreValue; comparison: ScoreValue }) => {
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

// -- Main cell factory --

export const createScoreColumnCell = (scoreName: string) => {
  const ScoreColumnCell = ({ row, table }: CellContext<EvalRow, unknown>) => {
    const {
      isComparison = false,
      heatmapEnabled = false,
      heatmapVariant = DEFAULT_HEATMAP_VARIANT,
      scoreRanges = {},
    } = table.options.meta?.evalCellMeta ?? {};
    const value = row.original[`score:${scoreName}`] as number | undefined;
    const range = scoreRanges[scoreName];

    if (isComparison) {
      const comparison = row.original[`compared:score:${scoreName}`] as number | undefined;

      if (heatmapEnabled && range) {
        return (
          <HeatmapComparisonCell
            original={isValidScore(value) ? formatScoreValue(value) : "-"}
            comparison={isValidScore(comparison) ? formatScoreValue(comparison) : "-"}
            originalValue={value}
            comparisonValue={comparison}
            range={range}
            variant={heatmapVariant}
          />
        );
      }

      return <StandardScoreComparison original={value} comparison={comparison} />;
    }

    if (heatmapEnabled && range) {
      return <HeatmapScoreCell value={value} range={range} variant={heatmapVariant} />;
    }

    return value ?? "-";
  };

  ScoreColumnCell.displayName = `ScoreColumnCell_${scoreName}`;
  return ScoreColumnCell;
};
