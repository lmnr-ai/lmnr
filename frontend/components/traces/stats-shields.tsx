import { TooltipPortal } from "@radix-ui/react-tooltip";
import { compact, get, sortBy, uniq } from "lodash";
import { Bolt, Braces, ChevronDown, CircleDollarSign, Clock3, Coins } from "lucide-react";
import { memo, PropsWithChildren } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, getDurationString, pluralize } from "@/lib/utils";

import CodeHighlighter from "../ui/code-highlighter/index";
import { Label } from "../ui/label";

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

const ToolsList = ({ tools }: { tools: Tool[] }) => {
  if (tools.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-6 w-fit items-center gap-1 text-xs font-mono border rounded-md px-2 border-tool bg-tool/20 text-tool hover:bg-tool/30 transition-colors">
          <Bolt size={12} className="min-w-3" />
          <span>{pluralize(tools.length, "tool", "tools")}</span>
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-96 p-0" align="start" side="bottom">
        <ScrollArea className="pb-2">
          <div className="max-h-[50vh] flex flex-col gap-2 p-2">
            {tools.map((tool, index) => (
              <div key={index} className="border rounded-md p-2 bg-muted/20">
                <div className="flex items-center gap-2 mb-1">
                  <Bolt size={10} className="text-tool" />
                  <Label className="text-xs font-mono font-semibold text-tool">{tool.name}</Label>
                </div>
                {tool.description && (
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{tool.description}</p>
                )}
                {tool.parameters && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground mb-1">
                      Parameters
                    </summary>
                    <CodeHighlighter readOnly value={tool.parameters} defaultMode="json" />
                  </details>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const StructuredOutputSchema = ({ schema }: { schema: string }) => {
  if (!schema) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="focus:outline-none flex h-6 w-fit items-center border-tool bg-tool/10 gap-1 text-xs font-mono border rounded-md px-2 text-tool hover:bg-tool/20 transition-colors">
          <Braces size={12} className="min-w-3" />
          <span>output schema</span>
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[600px] p-0" align="end" side="bottom">
        <CodeHighlighter readOnly value={schema} defaultMode="json" className="max-h-[70vh]" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const extractToolsFromAttributes = (attributes: Record<string, any>): Tool[] => {
  const aiPromptTools = get(attributes, "ai.prompt.tools");
  if (aiPromptTools) {
    try {
      return aiPromptTools.map((tool: any) => ({
        name: get(tool, "name", ""),
        description: get(tool, "description", ""),
        parameters: typeof tool.parameters === "string" ? tool.parameters : JSON.stringify(tool.parameters || {}),
      }));
    } catch (e) {
      console.error("Failed to parse ai.prompt.tools:", e);
    }
  }

  const functionIndices = uniq(
    Object.keys(attributes)
      .map((key) => key.match(/^llm\.request\.functions\.(\d+)\.name$/)?.[1])
      .filter(Boolean)
      .map(Number)
  );

  return compact(
    sortBy(functionIndices).map((index) => {
      const name = attributes[`llm.request.functions.${index}.name`];
      const description = attributes[`llm.request.functions.${index}.description`];
      const parameters = attributes[`llm.request.functions.${index}.parameters`];

      return name ? { name, description, parameters } : null;
    })
  );
};

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
              <Label className="text-xs truncate">{cost?.toFixed(3)}</Label>
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-1">
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Total cost</span> {"$" + cost?.toFixed(5)}
                </Label>
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

const PureTraceStatsShields = ({ trace, className, children }: PropsWithChildren<TraceStatsShieldsProps>) => (
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

const SpanStatsShields = ({
  startTime,
  endTime,
  attributes,
  className,
  children,
}: PropsWithChildren<SpanStatsShieldsProps>) => {
  const inputTokenCount = attributes["gen_ai.usage.input_tokens"] ?? 0;
  const outputTokenCount = attributes["gen_ai.usage.output_tokens"] ?? 0;
  const totalTokenCount = inputTokenCount + outputTokenCount;
  const inputCost = attributes["gen_ai.usage.input_cost"] ?? 0;
  const outputCost = attributes["gen_ai.usage.output_cost"] ?? 0;
  const cost = attributes["gen_ai.usage.cost"] ?? 0;
  const model = get(attributes, "gen_ai.response.model") || get(attributes, "gen_ai.request.model") || "";
  const tools = extractToolsFromAttributes(attributes);
  const structuredOutputSchema = attributes["gen_ai.request.structured_output_schema"];

  return (
    <div className="flex flex-wrap flex-col gap-1.5">
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
      {(model || tools?.length > 0 || structuredOutputSchema) && (
        <div className="flex flex-wrap gap-2">
          {model && (
            <Label className="h-6 w-fit flex items-center text-xs truncate font-mono border rounded-md px-2 border-llm-foreground bg-llm-foreground/10 text-llm-foreground">
              {model}
            </Label>
          )}
          <ToolsList tools={tools} />
          <StructuredOutputSchema schema={structuredOutputSchema} />
        </div>
      )}
    </div>
  );
};

export const TraceStatsShields = memo(PureTraceStatsShields);
export default memo(SpanStatsShields);
