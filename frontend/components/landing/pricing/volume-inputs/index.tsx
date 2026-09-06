"use client";

import { Slider } from "@/components/ui/slider";

import Cell from "./cell";
import { COVERAGE_STEPS, formatTokens, RUN_STEPS, TOKENS_PER_RUN_STEPS, type VolumeProps } from "./steps";

/** Sits on the number line, not the cell's centre. Dropped below `sm`, where
 *  the cells stack and there is no line for it to sit on. */
const Operator = ({ glyph }: { glyph: string }) => (
  <span className="text-2xl text-foreground-400 self-start pt-6 hidden sm:block">{glyph}</span>
);

// The arithmetic IS the layout: two inputs and one output, read left to right.
// Coverage sits BELOW at full width, not in the equation — it is a percentage of
// the runs, and a fourth cell on that line would read as part of the product. It
// needs 40px of air either side or it reads as the equation's next line.
const VolumeInputs = ({
  runsIdx,
  tokensPerRunIdx,
  coverageIdx,
  onRunsIdx,
  onTokensPerRunIdx,
  onCoverageIdx,
}: VolumeProps) => {
  const runs = RUN_STEPS[runsIdx];
  const tokensPerRun = TOKENS_PER_RUN_STEPS[tokensPerRunIdx];

  return (
    <div className="space-y-10 pb-4">
      {/* The product's column HUGS its content; the two factors split
          everything left over. It carries no track, so giving it a share of the
          width left a tail of empty space that read as a slider that had failed
          to render — and hugging beats a fixed width because the string it
          holds changes length as the sliders move. */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] sm:gap-8">
        <Cell
          label="Tokens per agent run"
          value={formatTokens(tokensPerRun)}
          slider={{ value: tokensPerRunIdx, max: TOKENS_PER_RUN_STEPS.length - 1, onChange: onTokensPerRunIdx }}
        />
        <Operator glyph="×" />
        <Cell
          label="Agent runs per month"
          value={runs.toLocaleString()}
          slider={{ value: runsIdx, max: RUN_STEPS.length - 1, onChange: onRunsIdx }}
        />
        <Operator glyph="=" />
        <Cell label="Tokens per month" value={formatTokens(runs * tokensPerRun)} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-white">Agent runs analyzed by Signals</span>
          <span className="text-white tabular-nums">{COVERAGE_STEPS[coverageIdx]}%</span>
        </div>
        <Slider
          value={[coverageIdx]}
          max={COVERAGE_STEPS.length - 1}
          min={0}
          step={1}
          onValueChange={(v) => onCoverageIdx(v[0])}
          className="w-full"
        />
      </div>
    </div>
  );
};

export default VolumeInputs;
