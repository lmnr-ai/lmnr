import { ArrowRight } from "lucide-react";

import {
  calculatePercentageChange,
  type DisplayValue,
  formatScoreValue,
  isValidScore,
  type ScoreRanges,
  type ScoreValue,
  shouldShowHeatmap,
} from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";
import { type EvalRow } from "@/lib/evaluation/types";

import { ChangeIndicator, shouldShowComparisonIndicator } from "./comparison-cell";
import { ScoreDisplay } from "./score-cell";

const ComparisonScoreValue = ({
  value,
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

// TODO: one component per file please

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
            {originalValue >= comparisonValue ? "\u25B2" : "\u25BC"} (
            {calculatePercentageChange(originalValue, comparisonValue)}
            %)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-1 w-full min-w-0">
      r{" "}
      <div className="flex-1 min-w-fit">
        <ComparisonScoreValue value={comparisonValue} displayValue={comparison} range={range} />
      </div>
      <ArrowRight className="font-bold text-gray-400 shrink-0" size={8} />
      <div className="flex-1 min-w-fit">
        <ComparisonScoreValue value={originalValue} displayValue={original} range={range} />
      </div>
      {showComparison && isValidScore(originalValue) && isValidScore(comparisonValue) && (
        <ChangeIndicator originalValue={originalValue} comparisonValue={comparisonValue} />
      )}
    </div>
  );
};

// TODO: no lowercase components
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
          {original >= comparison ? "\u25B2" : "\u25BC"} ({calculatePercentageChange(original, comparison)}%)
        </span>
      )}
    </div>
  );
};

// TODO: no lowercase components
export const createComparisonScoreColumnCell = (
  heatmapEnabled: boolean,
  scoreRanges: ScoreRanges,
  scoreName: string
) => {
  const ComparisonScoreColumnCell = ({ row }: { row: { original: EvalRow } }) => {
    const original = row.original[`score:${scoreName}`] as number | undefined;
    const comparison = row.original[`compared:score:${scoreName}`] as number | undefined;
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
