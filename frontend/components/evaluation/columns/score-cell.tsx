import { type CellContext, type Table } from "@tanstack/react-table";
import { ArrowRight, Check } from "lucide-react";
import { type ReactNode } from "react";

import HeatmapValue from "@/components/evaluation/heatmap-value";
import {
  calculatePercentageChange,
  type DisplayValue,
  formatScoreValue,
  getHeatmapColor,
  isValidScore,
  type ScoreValue,
  shouldShowHeatmap,
} from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";
import { type EvalRow } from "@/lib/evaluation/types";

import { shouldShowComparisonIndicator } from "./comparison-cell";

const ScoreDisplay = ({
  range,
  value,
  isHigherBetter,
}: {
  range: ScoreRange;
  value: ScoreValue;
  isHigherBetter: boolean;
}) => {
  if (!isValidScore(value)) {
    return <span className="text-gray-500">-</span>;
  }

  return (
    <HeatmapValue
      value={value}
      range={range}
      isHigherBetter={isHigherBetter}
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
  isHigherBetter,
}: {
  value: ScoreValue;
  range: ScoreRange;
  isHigherBetter: boolean;
}) => <ScoreDisplay range={range} value={value} isHigherBetter={isHigherBetter} />;

// -- Comparison sub-components (absorbed from comparison-score-cell.tsx) --

// One color block for the RELATIVE change (original - compared), not two blocks
// of absolute values: the question in comparison mode is "did this row get
// better or worse", so the delta is colored on a symmetric scale centered at
// zero (span taken from the score's absolute range). No delta or zero span =
// no block.
const HeatmapComparisonCell = ({
  original,
  comparison,
  originalValue,
  comparisonValue,
  range,
  isHigherBetter,
}: {
  original: DisplayValue;
  comparison: DisplayValue;
  originalValue?: number;
  comparisonValue?: number;
  range: ScoreRange;
  isHigherBetter: boolean;
}) => {
  const showComparison = shouldShowComparisonIndicator(originalValue, comparisonValue);
  const span = range.max - range.min;
  // Zero delta gets NO block (not the gradient midpoint) so actual movement pops.
  // For lower-is-better scores the delta gradient inverts (a decrease is green).
  const deltaColor =
    shouldShowHeatmap(range) &&
    isValidScore(originalValue) &&
    isValidScore(comparisonValue) &&
    originalValue !== comparisonValue
      ? getHeatmapColor(originalValue - comparisonValue, { min: -span, max: span }, isHigherBetter)
      : null;

  const content = (
    <div className="flex items-center space-x-2 min-w-0">
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

  if (!deltaColor) return content;

  return (
    <div className="flex h-full items-stretch gap-2 min-w-0">
      <span className="w-1 shrink-0 self-stretch rounded-sm" style={{ background: deltaColor }} />
      <span className="flex items-center min-w-0">{content}</span>
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
      scoreRanges = {},
      scoreDirections = {},
    } = table.options.meta?.evalCellMeta ?? {};
    const value = row.original[`score:${scoreName}`] as number | undefined;
    const range = scoreRanges[scoreName];
    const isHigherBetter = scoreDirections[scoreName] ?? true;

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
            isHigherBetter={isHigherBetter}
          />
        );
      }

      return <StandardScoreComparison original={value} comparison={comparison} />;
    }

    if (heatmapEnabled && range) {
      return <HeatmapScoreCell value={value} range={range} isHigherBetter={isHigherBetter} />;
    }

    return isValidScore(value) ? formatScoreValue(value) : "-";
  };

  ScoreColumnCell.displayName = `ScoreColumnCell_${scoreName}`;
  return ScoreColumnCell;
};

// -- Header dropdown "Higher is better" toggle --

export type ScoreDirectionMenuItem = { label: string; icon?: ReactNode; isActive?: boolean; onClick: () => void };

// Shared "Higher is better" header-dropdown item, used by both eval tables.
export function higherBetterMenuItem(isHigherBetter: boolean, onClick: () => void): ScoreDirectionMenuItem {
  return {
    label: "Higher is better",
    isActive: isHigherBetter,
    icon: isHigherBetter ? <Check className="size-3.5 text-primary-foreground" /> : <span className="size-3.5" />,
    onClick,
  };
}

// Built as a `customDropdownItems` factory on the score column so the toggle
// reads live state off the table meta (no column-def rebuild on every flip).
// Returns [] when no toggle handler is wired (e.g. shared/public evals).
export function scoreDirectionDropdownItems(scoreName: string, table: unknown): ScoreDirectionMenuItem[] {
  const meta = (table as Table<EvalRow>).options.meta?.evalCellMeta;
  const onToggle = meta?.onToggleScoreDirection;
  if (!onToggle) return [];
  return [higherBetterMenuItem(meta?.scoreDirections?.[scoreName] ?? true, () => onToggle(scoreName))];
}
