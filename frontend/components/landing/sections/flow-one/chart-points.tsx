import { Fragment } from "react";

import { Tooltip, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

import { BENCHMARK_MODELS } from "./benchmark-data";
import {
  descF1ToY,
  FIRST_COLUMN_WIDTH,
  LAST_ROW_HEIGHT,
  percentX,
  percentY,
  scaledWidth,
  tracesPerDollarToX,
} from "./chart-geometry";
import ModelTooltipContent from "./model-tooltip-content";

const LABEL_LEFT_OFFSET: Record<string, number> = {
  "flow-1": 41,
  "GPT-6 Luna": 76,
};

const LABELS_ON_RIGHT = new Set(["Claude Opus 5", "Claude Sonnet 5", "GPT-6 Sol", "Gemini 3.8 Flash"]);

const ChartPoints = () => (
  <div className="pointer-events-none absolute inset-0 z-20">
    {BENCHMARK_MODELS.map((model) => {
      const x = tracesPerDollarToX(model.tracesPerDollar);
      const y = descF1ToY(model.descF1);
      const labelX = LABELS_ON_RIGHT.has(model.label) ? x + 8 : x - (LABEL_LEFT_OFFSET[model.label] ?? 80);
      const labelY = y - (model.flow ? 19 : 7);
      const pointSize = model.flow ? 8 : 4;

      return (
        <Fragment key={model.label}>
          {model.flow && (
            <>
              <span
                aria-hidden
                className="absolute border-t border-dashed border-surface-800"
                style={{ left: percentX(FIRST_COLUMN_WIDTH), right: 0, top: percentY(y) }}
              />
              <span
                aria-hidden
                className="absolute border-l border-dashed border-surface-800"
                style={{ bottom: percentY(LAST_ROW_HEIGHT), left: percentX(x), top: 0 }}
              />
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${model.label} label benchmark details`}
                className="pointer-events-auto absolute cursor-help whitespace-nowrap border-0 bg-transparent p-0 text-left font-sans-landing font-normal"
                style={{
                  color: model.flow ? "var(--color-primary-100)" : "#c3c4c8",
                  fontSize: scaledWidth(12),
                  left: percentX(labelX),
                  lineHeight: "normal",
                  top: percentY(labelY),
                }}
              >
                {model.label}
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <ModelTooltipContent descF1={model.descF1} tracesPerDollar={model.tracesPerDollar} />
            </TooltipPortal>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${model.label} benchmark details`}
                className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 cursor-help items-center justify-center border-0 bg-transparent p-0"
                style={{ left: percentX(x), top: percentY(y), width: scaledWidth(24), height: scaledWidth(24) }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    backgroundColor: model.flow ? "#d0754e" : "#c3c4c8",
                    height: scaledWidth(pointSize),
                    width: scaledWidth(pointSize),
                  }}
                />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <ModelTooltipContent descF1={model.descF1} tracesPerDollar={model.tracesPerDollar} />
            </TooltipPortal>
          </Tooltip>
        </Fragment>
      );
    })}
  </div>
);

export default ChartPoints;
