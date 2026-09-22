import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

import AxisTickLabels from "./axis-tick-labels";
import { CHART_HEIGHT, FIRST_COLUMN_WIDTH, LAST_ROW_HEIGHT, percentX, percentY, scaledWidth } from "./chart-geometry";

const AxisHelp = ({ label, children }: { label: string; children: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" aria-label={label} className="cursor-help text-[#5d5e62]">
        <Info style={{ width: scaledWidth(14), height: scaledWidth(14) }} />
      </button>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent className="max-w-40 bg-surface-up-4">{children}</TooltipContent>
    </TooltipPortal>
  </Tooltip>
);

const ChartGrid = () => (
  <div className="absolute inset-0 z-10">
    <div
      className="absolute left-0 top-0 bg-[#20202138]"
      style={{ width: percentX(FIRST_COLUMN_WIDTH), height: percentY(CHART_HEIGHT - LAST_ROW_HEIGHT) }}
    />
    <div className="absolute bottom-0 left-0 right-0 bg-[#20202138]" style={{ height: percentY(LAST_ROW_HEIGHT) }} />
    <AxisTickLabels />
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ clipPath: `inset(0 0 ${percentY(LAST_ROW_HEIGHT)} ${percentX(FIRST_COLUMN_WIDTH)})` }}
    >
      <div
        className="absolute -translate-x-1/2 bg-[#454545]"
        style={{ left: percentX(FIRST_COLUMN_WIDTH), top: 0, width: scaledWidth(1), height: "100%" }}
      />
      <div
        className="absolute left-0 right-0 -translate-y-1/2 bg-[#454545]"
        style={{ top: percentY(CHART_HEIGHT - LAST_ROW_HEIGHT), height: scaledWidth(1) }}
      />
    </div>
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: percentX(FIRST_COLUMN_WIDTH),
        right: 0,
        top: percentY(CHART_HEIGHT - LAST_ROW_HEIGHT + 7),
        bottom: 0,
      }}
    >
      <div className="flex items-center gap-[0.68cqw] whitespace-nowrap font-sans-landing text-[1.36cqw] text-[#7c7e85]">
        <span>Traces analyzed per dollar</span>
        <AxisHelp label="About the cost estimate">Calculated from measured cost per run at 16k characters</AxisHelp>
      </div>
    </div>
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: 0,
        top: 0,
        width: percentX(FIRST_COLUMN_WIDTH),
        height: percentY(CHART_HEIGHT - LAST_ROW_HEIGHT),
        transform: `translateX(${scaledWidth(-9)})`,
      }}
    >
      <div className="flex flex-none -rotate-90 items-center gap-[0.68cqw] whitespace-nowrap font-sans-landing text-[1.36cqw] text-[#7c7e85]">
        <span>Trace analysis intelligence (%)</span>
        <AxisHelp label="About the trace analysis intelligence benchmark">
          F1 results from our trace analysis benchmark
        </AxisHelp>
      </div>
    </div>
  </div>
);

export default ChartGrid;
