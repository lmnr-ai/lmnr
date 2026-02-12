import { ArrowRight } from "lucide-react";

import { useEvalStore } from "@/components/evaluation/store";
import {
  calculatePercentageChange,
  createHeatmapStyle,
  type DisplayValue,
  formatScoreValue,
  isValidScore,
  type ScoreValue,
  shouldShowHeatmap,
} from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";
import { type EvalRow } from "@/lib/evaluation/types";

import { ChangeIndicator, shouldShowComparisonIndicator } from "./comparison-cell";

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

export { ScoreDisplay };

const HeatmapScoreCell = ({ value, range }: { value: ScoreValue; range: ScoreRange }) => ScoreDisplay(range, value);

// -- Comparison sub-components (absorbed from comparison-score-cell.tsx) --

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

const StandardScoreComparison = ({
  original,
  comparison,
}: {
  original: ScoreValue;
  comparison: ScoreValue;
}) => {
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

// -- Main cell factory --

export const createScoreColumnCell = (scoreName: string) => {
  const ScoreColumnCell = ({ row }: { row: { original: EvalRow } }) => {
    const isComparison = useEvalStore((s) => s.isComparison);
    const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
    const scoreRanges = useEvalStore((s) => s.scoreRanges);
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
          />
        );
      }

      return <StandardScoreComparison original={value} comparison={comparison} />;
    }

    if (heatmapEnabled && range) {
      return <HeatmapScoreCell value={value} range={range} />;
    }

    return value ?? "-";
  };

  ScoreColumnCell.displayName = `ScoreColumnCell_${scoreName}`;
  return ScoreColumnCell;
};
