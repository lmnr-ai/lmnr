import { useEvalStore } from "@/components/evaluation/store";
import {
  createHeatmapStyle,
  formatScoreValue,
  isValidScore,
  type ScoreValue,
} from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";
import { type EvalRow } from "@/lib/evaluation/types";

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

export const createScoreColumnCell = (scoreName: string) => {
  const ScoreColumnCell = ({ row }: { row: { original: EvalRow } }) => {
    const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
    const scoreRanges = useEvalStore((s) => s.scoreRanges);
    const value = row.original[`score:${scoreName}`] as number | undefined;
    const range = scoreRanges[scoreName];

    if (heatmapEnabled && range) {
      return <HeatmapScoreCell value={value} range={range} />;
    }

    return value ?? "-";
  };

  ScoreColumnCell.displayName = `ScoreColumnCell_${scoreName}`;
  return ScoreColumnCell;
};
