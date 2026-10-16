import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

import AxisTickLabels from "./axis-tick-labels";
import { scaledWidth, scaledWidthAtLeast } from "./chart-geometry";

const AxisHelp = ({ label, children }: { label: string; children: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" aria-label={label} className="cursor-help text-[#5d5e62]">
        <Info style={{ width: scaledWidthAtLeast(14, 12), height: scaledWidthAtLeast(14, 12) }} />
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
      style={{ width: "var(--chart-left-gutter)", height: "calc(100% - var(--chart-bottom-row))" }}
    />
    <div className="absolute bottom-0 left-0 right-0 bg-[#20202138]" style={{ height: "var(--chart-bottom-row)" }} />
    <AxisTickLabels />
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ clipPath: "inset(0 0 var(--chart-bottom-row) var(--chart-left-gutter))" }}
    >
      <div
        className="absolute -translate-x-1/2 bg-[#454545]"
        style={{ left: "var(--chart-left-gutter)", top: 0, width: scaledWidth(1), height: "100%" }}
      />
      <div
        className="absolute left-0 right-0 -translate-y-1/2 bg-[#454545]"
        style={{ top: "calc(100% - var(--chart-bottom-row))", height: scaledWidth(1) }}
      />
    </div>
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: "var(--chart-left-gutter)",
        right: 0,
        top: `calc(100% - var(--chart-bottom-row) + ${scaledWidth(9)})`,
        bottom: 0,
      }}
    >
      <div
        className="flex items-center gap-[0.68cqw] whitespace-nowrap font-sans-landing text-[#7c7e85]"
        style={{ fontSize: scaledWidthAtLeast(12, 10) }}
      >
        <span>Traces analyzed per dollar</span>
        <AxisHelp label="About the cost estimate">Estimates based on our trace analysis benchmark</AxisHelp>
      </div>
    </div>
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: 0,
        top: 0,
        width: "var(--chart-left-gutter)",
        height: "calc(100% - var(--chart-bottom-row))",
        transform: `translateX(${scaledWidth(-9)})`,
      }}
    >
      <div
        className="flex flex-none -rotate-90 items-center gap-[0.68cqw] whitespace-nowrap font-sans-landing text-[#7c7e85]"
        style={{ fontSize: scaledWidthAtLeast(12, 10) }}
      >
        <span>Trace analysis intelligence (%)</span>
        <AxisHelp label="About the trace analysis intelligence benchmark">
          Results from our trace analysis benchmark
        </AxisHelp>
      </div>
    </div>
  </div>
);

export default ChartGrid;
