import { TooltipPortal } from "@radix-ui/react-tooltip";
import { compact, get, isNil, pick, sortBy, uniq } from "lodash";
import { Bolt, Braces, ChevronDown, CircleDollarSign, Clock3, Coins } from "lucide-react";
import { memo, type PropsWithChildren, useMemo } from "react";

import {
  type TraceViewSpan,
  type TraceViewTrace,
  useTraceViewStoreContext,
} from "@/components/traces/trace-view/trace-view-store.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type Span } from "@/lib/traces/types.ts";
import { cn, getDurationString, pluralize } from "@/lib/utils";

import ContentRenderer from "../ui/content-renderer/index";
import { Label } from "../ui/label";

interface TraceStatsShieldsProps {
  trace: TraceViewTrace;
  className?: string;
}

// Compute aggregate stats from a list of spans
function computeSpanStats(spans: TraceViewSpan[]): Pick<
  TraceViewSpan,
  | "startTime"
  | "endTime"
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "inputCost"
  | "outputCost"
  | "totalCost"
  | "cacheReadInputTokens"
> {
  if (spans.length === 0) {
    return {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      cacheReadInputTokens: 0,
    };
  }

  let minStart = new Date(spans[0].startTime).getTime();
  let maxEnd = new Date(spans[0].endTime).getTime();
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let inputCost = 0;
  let outputCost = 0;
  let totalCost = 0;
  let cacheReadInputTokens = 0;

  for (const span of spans) {
    const start = new Date(span.startTime).getTime();
    const end = new Date(span.endTime).getTime();
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;

    inputTokens += span.inputTokens || 0;
    outputTokens += span.outputTokens || 0;
    totalTokens += span.totalTokens || 0;
    inputCost += span.inputCost || 0;
    outputCost += span.outputCost || 0;
    totalCost += span.totalCost || 0;
    cacheReadInputTokens += span.cacheReadInputTokens || 0;
  }

  return {
    startTime: new Date(minStart).toISOString(),
    endTime: new Date(maxEnd).toISOString(),
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
    cacheReadInputTokens,
  };
}

interface SpanStatsShieldsProps {
  span: Span;
  className?: string;
}

interface Tool {
  name: string;
  description?: string;
  parameters?: string;
}

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

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
                    <ContentRenderer readOnly value={tool.parameters} defaultMode="json" />
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
        <button className="focus:outline-hidden flex h-6 w-fit items-center border-tool bg-tool/10 gap-1 text-xs font-mono border rounded-md px-2 text-tool hover:bg-tool/20 transition-colors">
          <Braces size={12} className="min-w-3" />
          <span>output schema</span>
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[600px] p-0" align="end" side="bottom">
        <ContentRenderer readOnly value={schema} defaultMode="json" className="max-h-[70vh]" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const extractToolsFromAttributes = (attributes: Record<string, any>): Tool[] => {
  if (isNil(attributes)) return [];

  const aiPromptTools = get(attributes, "ai.prompt.tools", []);

  if (aiPromptTools && Array.isArray(aiPromptTools) && aiPromptTools.length > 0) {
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

  const genAiToolDefinitions = get(attributes, "gen_ai.tool.definitions");
  // TODO: add strong typing here, make it flexible for non-OpenAI tool typing, potentially
  // moving the schema parsing to provider-specific types, i.e. @/lib/spans/types
  if (genAiToolDefinitions) {
    try {
      const parsed = JSON.parse(genAiToolDefinitions);
      return parsed.map((tool: any) => {
        const func = tool.function ?? tool;
        return {
          name: func.name,
          description: func.description,
          parameters: typeof func.parameters === "string" ? func.parameters : JSON.stringify(func.parameters || {}),
        };
      });
    } catch (e) {
      console.error("Failed to parse gen_ai.tool.definitions:", e);
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
      const rawParameters = attributes[`llm.request.functions.${index}.parameters`];
      const parameters = typeof rawParameters === "string" ? rawParameters : JSON.stringify(rawParameters || {});

      return name ? { name, description, parameters } : null;
    })
  );
};

function StatsShieldsContent({
  stats,
  className,
  children,
  singlePill = false,
}: PropsWithChildren<{
  stats: Pick<
    TraceViewSpan,
    | "startTime"
    | "endTime"
    | "inputTokens"
    | "outputTokens"
    | "totalTokens"
    | "inputCost"
    | "outputCost"
    | "totalCost"
    | "cacheReadInputTokens"
  >;
  className?: string;
  singlePill?: boolean;
}>) {
  const durationContent = (
    <div className="flex space-x-1 items-center">
      <Clock3 size={12} className="min-w-3 min-h-3" />
      <Label className="text-xs truncate" title={getDurationString(stats.startTime, stats.endTime)}>
        {getDurationString(stats.startTime, stats.endTime)}
      </Label>
    </div>
  );

  const tokensContent = (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger className="min-w-8">
          <div className="flex space-x-1 items-center">
            <Coins className="min-w-3" size={12} />
            <Label className="text-xs truncate">{compactNumberFormat.format(stats.totalTokens)}</Label>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="p-2 border">
            <div className="flex-col space-y-1">
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Input tokens</span>{" "}
                {numberFormat.format(stats.inputTokens)}
              </Label>
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Output tokens</span>{" "}
                {numberFormat.format(stats.outputTokens)}
              </Label>
              {!!stats.cacheReadInputTokens && (
                <Label className="flex text-xs gap-1 text-success-bright">
                  <span>Cache read input tokens</span> {numberFormat.format(stats.cacheReadInputTokens)}
                </Label>
              )}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );

  const costContent = (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger className="min-w-8">
          <div className="flex space-x-1 items-center">
            <CircleDollarSign className="min-w-3" size={12} />
            <Label className="text-xs truncate">{stats.totalCost?.toFixed(2)}</Label>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="p-2 border">
            <div className="flex-col space-y-1">
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Total cost</span> {"$" + stats.totalCost?.toFixed(5)}
              </Label>
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Input cost</span> {"$" + stats.inputCost?.toFixed(5)}
              </Label>
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Output cost</span> {"$" + stats.outputCost?.toFixed(5)}
              </Label>
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );

  if (singlePill) {
    return (
      <div className={cn("flex items-center min-w-0", className)}>
        <div className="flex items-center gap-2 px-1.5 py-0.5 bg-muted rounded-md overflow-hidden text-secondary-foreground">
          {durationContent}
          {tokensContent}
          {costContent}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 font-mono min-w-0", className)}>
      <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
        {durationContent}
      </div>
      <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
        {tokensContent}
      </div>
      <div className="flex space-x-1 items-center p-0.5 px-2 min-w-8 border rounded-md">
        {costContent}
      </div>
      {children}
    </div>
  );
}

const PureTraceStatsShields = ({ trace, className, children, singlePill }: PropsWithChildren<TraceStatsShieldsProps & { singlePill?: boolean }>) => {
  const { spans, condensedTimelineVisibleSpanIds } = useTraceViewStoreContext((state) => ({
    spans: state.spans,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
  }));

  // Compute stats: use filtered spans if selection is active, otherwise use trace stats
  const stats = useMemo(() => {
    const hasSelection = condensedTimelineVisibleSpanIds.size > 0;

    if (!hasSelection) {
      return pick(trace, [
        "startTime",
        "endTime",
        "inputTokens",
        "outputTokens",
        "totalTokens",
        "cacheReadInputTokens",
        "inputCost",
        "outputCost",
        "totalCost",
      ]);
    }

    // Filter spans by selection and compute aggregate stats
    const filteredSpans = spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));
    return computeSpanStats(filteredSpans);
  }, [trace, spans, condensedTimelineVisibleSpanIds]);

  return (
    <StatsShieldsContent stats={stats} className={className} singlePill={singlePill}>
      {children}
    </StatsShieldsContent>
  );
};

const SpanStatsShields = ({ span, className, children }: PropsWithChildren<SpanStatsShieldsProps>) => {
  const model = get(span.attributes, "gen_ai.response.model") || get(span.attributes, "gen_ai.request.model") || "";
  const tools = extractToolsFromAttributes(span.attributes);
  const structuredOutputSchema =
    get(span.attributes, "gen_ai.request.structured_output_schema") || get(span.attributes, "ai.schema");

  return (
    <div className="flex flex-wrap flex-col gap-1.5">
      <StatsShieldsContent
        stats={pick(span, [
          "startTime",
          "endTime",
          "inputTokens",
          "outputTokens",
          "totalTokens",
          "inputCost",
          "outputCost",
          "totalCost",
        ])}
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
