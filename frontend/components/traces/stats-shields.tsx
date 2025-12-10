import { TooltipPortal } from "@radix-ui/react-tooltip";
import { compact, get, isNil, pick, sortBy, uniq } from "lodash";
import { Bolt, Braces, ChevronDown, CircleDollarSign, Clock3, Coins } from "lucide-react";
import { memo, PropsWithChildren } from "react";

import { TraceViewSpan, TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Span } from "@/lib/traces/types.ts";
import { cn, getDurationString, pluralize } from "@/lib/utils";

import ContentRenderer from "../ui/content-renderer/index";
import { Label } from "../ui/label";

interface TraceStatsShieldsProps {
  trace: TraceViewTrace;
  className?: string;
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
}: PropsWithChildren<{
  stats: Pick<
    TraceViewSpan,
    "startTime" | "endTime" | "inputTokens" | "outputTokens" | "totalTokens" | "inputCost" | "outputCost" | "totalCost"
  >;
  className?: string;
}>) {
  return (
    <div className={cn("flex items-center gap-2 font-mono min-w-0", className)}>
      <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
        <Clock3 size={12} className="min-w-3 min-h-3" />
        <Label className="text-xs truncate text-foreground" title={getDurationString(stats.startTime, stats.endTime)}>
          {getDurationString(stats.startTime, stats.endTime)}
        </Label>
      </div>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger className="min-w-8">
            <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
              <Coins className="min-w-3" size={12} />
              <Label className="text-xs truncate text-foreground">{stats.totalTokens}</Label>
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-1">
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Input tokens</span> {stats.inputTokens}
                </Label>
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Output tokens</span> {stats.outputTokens}
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
              <Label className="text-xs truncate text-foreground">{stats.totalCost?.toFixed(3)}</Label>
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
      {children}
    </div>
  );
}

const PureTraceStatsShields = ({ trace, className, children }: PropsWithChildren<TraceStatsShieldsProps>) => (
  <StatsShieldsContent
    stats={pick(trace, [
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
);

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
