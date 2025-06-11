import { TooltipPortal } from "@radix-ui/react-tooltip";
import { CircleDollarSign, Clock3, Coins, InfoIcon, ChevronDown, Bolt } from "lucide-react";
import { PropsWithChildren } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDurationString } from "@/lib/flow/utils";
import { cn } from "@/lib/utils";

import { Label } from "../ui/label";
import CodeHighlighter from "../ui/code-highlighter/index";

interface TraceStatsShieldsProps {
  trace: {
    startTime: string;
    endTime: string;
    totalTokenCount: number;
    inputTokenCount: number;
    outputTokenCount: number;
    inputCost: number | null;
    outputCost: number | null;
    cost: number | null;
  };
  className?: string;
}

interface SpanStatsShieldsProps {
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  className?: string;
}

interface Tool {
  name: string;
  description?: string;
  parameters?: string;
}

function ToolsComponent({ tools }: { tools: Tool[] }) {
  if (tools.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-xs font-mono border rounded-md p-1 px-2 border-tool bg-tool/20 text-tool hover:bg-tool/30 transition-colors">
          <Bolt size={12} className="min-w-3" />
          <span>{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-96 max-h-[50vh] overflow-y-auto p-2 space-y-2"
        align="start"
        side="bottom"
      >
        {tools.map((tool, index) => (
          <div key={index} className="border rounded-md p-2 bg-muted/20">
            <div className="flex items-center gap-2 mb-1">
              <Bolt size={10} className="text-tool" />
              <Label className="text-xs font-mono font-semibold text-tool">
                {tool.name}
              </Label>
            </div>
            {tool.description && (
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                {tool.description}
              </p>
            )}
            {tool.parameters && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground mb-1">
                  Parameters
                </summary>
                <CodeHighlighter value={tool.parameters} defaultMode="json" />
              </details>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function extractToolsFromAttributes(attributes: Record<string, any>): Tool[] {
  const tools: Tool[] = [];
  const functionIndices = new Set<number>();

  // Find all function indices
  Object.keys(attributes).forEach(key => {
    const match = key.match(/^llm\.request\.functions\.(\d+)\.name$/);
    if (match) {
      functionIndices.add(parseInt(match[1]));
    }
  });

  // Extract tools data
  Array.from(functionIndices).sort().forEach(index => {
    const name = attributes[`llm.request.functions.${index}.name`];
    const description = attributes[`llm.request.functions.${index}.description`];
    const parameters = attributes[`llm.request.functions.${index}.parameters`];

    if (name) {
      tools.push({
        name,
        description,
        parameters
      });
    }
  });

  return tools;
}

function StatsShieldsContent({
  startTime,
  endTime,
  totalTokenCount,
  inputTokenCount,
  outputTokenCount,
  inputCost,
  outputCost,
  cost,
  className,
  children,
}: PropsWithChildren<{
  startTime: string;
  endTime: string;
  totalTokenCount: number;
  inputTokenCount: number;
  outputTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  className?: string;
}>) {
  return (
    <div className={cn("flex items-center gap-2 font-mono min-w-0", className)}>
      <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
        <Clock3 size={12} className="min-w-3 min-h-3" />
        <Label className="text-xs truncate" title={getDurationString(startTime, endTime)}>
          {getDurationString(startTime, endTime)}
        </Label>
      </div>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger className="min-w-8">
            <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
              <Coins className="min-w-3" size={12} />
              <Label className="text-xs truncate">{totalTokenCount}</Label>
              <InfoIcon size={12} />
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-1">
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Input tokens</span> {inputTokenCount}
                </Label>
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Output tokens</span> {outputTokenCount}
                </Label>
              </div>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger className="min-w-8">
            <div className="flex space-x-1 items-center p-0.5 px-2 min-w-8 border rounded-md">
              <CircleDollarSign className="min-w-3" size={12} />
              <Label className="text-xs truncate">${cost?.toFixed(5)}</Label>
              <InfoIcon size={12} />
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-1">
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Input cost</span> {"$" + inputCost?.toFixed(5)}
                </Label>
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Output cost</span> {"$" + outputCost?.toFixed(5)}
                </Label>
              </div>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      {children}
    </div>
  );
}

export function TraceStatsShields({
  trace,
  className,
  children,
}: PropsWithChildren<TraceStatsShieldsProps>) {
  return (
    <StatsShieldsContent
      startTime={trace.startTime}
      endTime={trace.endTime}
      totalTokenCount={trace.totalTokenCount}
      inputTokenCount={trace.inputTokenCount}
      outputTokenCount={trace.outputTokenCount}
      inputCost={trace.inputCost}
      outputCost={trace.outputCost}
      cost={trace.cost}
      className={className}
    >
      {children}
    </StatsShieldsContent>
  );
}

export function SpanStatsShields({
  startTime,
  endTime,
  attributes,
  className,
  children,
}: PropsWithChildren<SpanStatsShieldsProps>) {
  const inputTokenCount = attributes["gen_ai.usage.input_tokens"] ?? 0;
  const outputTokenCount = attributes["gen_ai.usage.output_tokens"] ?? 0;
  const totalTokenCount = inputTokenCount + outputTokenCount;
  const inputCost = attributes["gen_ai.usage.input_cost"] ?? 0;
  const outputCost = attributes["gen_ai.usage.output_cost"] ?? 0;
  const cost = attributes["gen_ai.usage.cost"] ?? 0;
  const model = attributes["gen_ai.response.model"] ?? "";
  const tools = extractToolsFromAttributes(attributes);

  return (
    <div className="flex flex-col gap-1">
      <StatsShieldsContent
        startTime={startTime}
        endTime={endTime}
        totalTokenCount={totalTokenCount}
        inputTokenCount={inputTokenCount}
        outputTokenCount={outputTokenCount}
        inputCost={inputCost}
        outputCost={outputCost}
        cost={cost}
        className={className}
      >
        {children}
      </StatsShieldsContent>
      <div className="flex flex-wrap gap-1">
        {model && (
          <div className="">
            <Label className="text-xs truncate font-mono border rounded-md p-1 px-2 border-llm-foreground bg-llm-foreground/10 text-llm-foreground">
              {model}
            </Label>
          </div>
        )}
        <ToolsComponent tools={tools} />
      </div>
    </div>
  );
}
