import { Fragment } from "react";

import { Tooltip, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

import { BENCHMARK_MODELS } from "./benchmark-data";
import { intelligenceToY, percentX, percentY, scaledWidth, tracesPerDollarToX } from "./chart-geometry";
import ModelTooltipContent from "./model-tooltip-content";

const LABEL_LEFT_OFFSET: Record<string, number> = {
  "Flow-1": 48,
  "GPT-5.6 Luna": 88,
};

const LABELS_ON_RIGHT = new Set(["Claude Opus 5", "Claude Sonnet 5", "GPT-5.6 Sol", "Gemini 3.8 Flash"]);

const ChartPoints = () => (
  <div className="pointer-events-none absolute inset-0 z-20">
    {BENCHMARK_MODELS.map((model) => {
      const x = tracesPerDollarToX(model.tracesPerDollar);
      const y = intelligenceToY(model.intelligence);
      const labelX = LABELS_ON_RIGHT.has(model.label) ? x + 8 : x - (LABEL_LEFT_OFFSET[model.label] ?? 80);
      const pointSize = model.flow ? 8 : 4;

      return (
        <Fragment key={model.label}>
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
                  top: percentY(y - 7),
                }}
              >
                {model.label}
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <ModelTooltipContent intelligence={model.intelligence} tracesPerDollar={model.tracesPerDollar} />
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
              <ModelTooltipContent intelligence={model.intelligence} tracesPerDollar={model.tracesPerDollar} />
            </TooltipPortal>
          </Tooltip>
        </Fragment>
      );
    })}
  </div>
);

export default ChartPoints;
