import { Fragment } from "react";

import { Tooltip, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

import { BENCHMARK_MODELS } from "./benchmark-data";
import { descF1ToY, plotPercentX, plotPercentY, scaledWidthAtLeast, tracesPerDollarToX } from "./chart-geometry";
import ModelTooltipContent from "./model-tooltip-content";

const LABELS_ON_RIGHT = new Set(["Claude Opus 5", "Claude Sonnet 5", "GPT-6 Sol", "Gemini 3.8 Flash"]);

const ChartPoints = () => (
  <div className="pointer-events-none absolute right-0 top-0 z-20 bottom-[var(--chart-bottom-row)] left-[var(--chart-left-gutter)]">
    {BENCHMARK_MODELS.map((model) => {
      const x = tracesPerDollarToX(model.tracesPerDollar);
      const y = descF1ToY(model.descF1);
      const labelOnRight = LABELS_ON_RIGHT.has(model.label);
      const pointSize = model.flow ? 8 : 4;

      return (
        <Fragment key={model.label}>
          {model.flow && (
            <>
              <span
                aria-hidden
                className="absolute border-t border-dashed border-surface-800"
                style={{ left: 0, right: 0, top: plotPercentY(y) }}
              />
              <span
                aria-hidden
                className="absolute border-l border-dashed border-surface-800"
                style={{ bottom: 0, left: plotPercentX(x), top: 0 }}
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
                  fontSize: scaledWidthAtLeast(12, 10),
                  left: plotPercentX(x),
                  lineHeight: "normal",
                  top: plotPercentY(y),
                  transform: model.flow
                    ? `translate(calc(-100% - ${scaledWidthAtLeast(6, 4)}), calc(-100% - ${scaledWidthAtLeast(6, 4)}))`
                    : labelOnRight
                      ? `translate(${scaledWidthAtLeast(8, 6)}, -50%)`
                      : `translate(calc(-100% - ${scaledWidthAtLeast(8, 6)}), -50%)`,
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
                style={{
                  left: plotPercentX(x),
                  top: plotPercentY(y),
                  width: scaledWidthAtLeast(24, 24),
                  height: scaledWidthAtLeast(24, 24),
                }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    backgroundColor: model.flow ? "#d0754e" : "#c3c4c8",
                    height: scaledWidthAtLeast(pointSize, pointSize),
                    width: scaledWidthAtLeast(pointSize, pointSize),
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
