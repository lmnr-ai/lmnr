import { compact, get, isNil, sortBy, uniq } from "lodash";
import { Bolt, ChevronDown, ChevronRight } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pluralize } from "@/lib/utils";

import ContentRenderer from "../ui/content-renderer/index";
import { Label } from "../ui/label";

export interface Tool {
  name: string;
  description?: string;
  parameters?: string;
}

/**
 * Normalize a single tool object (whichever provider shape it came in as)
 * into the renderer's `Tool` shape.
 */
const normalizeTool = (tool: any): Tool | null => {
  // Legacy / unreified `ai.prompt.tools` entries can be JSON-encoded strings
  // (older spans ingested before the backend reified them, or entries whose
  // server-side parse failed). Parse them here so the attributes fallback
  // still surfaces the tool instead of dropping it.
  if (typeof tool === "string") {
    try {
      tool = JSON.parse(tool);
    } catch {
      return null;
    }
  }
  if (isNil(tool) || typeof tool !== "object") return null;
  const func = tool.function ?? tool;
  // Responses-API hosted tools (web_search, file_search, computer_use_preview, mcp, …)
  // don't carry name/description/parameters — derive a readable name from `type`.
  const name = get(func, "name") ?? (typeof tool.type === "string" ? tool.type : "");
  if (!name) return null;
  const description = get(func, "description");
  const rawParameters = get(func, "parameters") ?? get(func, "input_schema") ?? get(func, "inputSchema");
  const parameters = typeof rawParameters === "string" ? rawParameters : JSON.stringify(rawParameters || {});
  return { name, description, parameters };
};

/**
 * Primary read path: tool definitions ride the span as a single deduped
 * JSON array reconstructed by `spans_v0` into the `tool_definitions`
 * column. The frontend just parses the array and normalizes each entry.
 */
export const extractToolsFromColumn = (toolsJson?: string | null): Tool[] => {
  if (!toolsJson) return [];
  try {
    const parsed = JSON.parse(toolsJson);
    if (!Array.isArray(parsed)) return [];
    return compact(parsed.map(normalizeTool));
  } catch (e) {
    console.error("Failed to parse spans_v0.tool_definitions:", e);
    return [];
  }
};

/**
 * Legacy path for spans written before the `tool_definitions` column
 * existed — definitions still live across one of several attribute
 * shapes. Used as a fallback when the column is empty.
 */
export const extractToolsFromAttributes = (attributes: Record<string, any>): Tool[] => {
  if (isNil(attributes)) return [];

  const aiPromptTools = get(attributes, "ai.prompt.tools", []);

  if (aiPromptTools && Array.isArray(aiPromptTools) && aiPromptTools.length > 0) {
    return compact(aiPromptTools.map(normalizeTool));
  }

  const genAiToolDefinitions = get(attributes, "gen_ai.tool.definitions");
  if (genAiToolDefinitions) {
    try {
      const parsed = typeof genAiToolDefinitions === "string" ? JSON.parse(genAiToolDefinitions) : genAiToolDefinitions;
      if (Array.isArray(parsed)) return compact(parsed.map(normalizeTool));
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
      const rawArguments = attributes[`llm.request.functions.${index}.arguments`];
      const rawInputSchema = attributes[`llm.request.functions.${index}.input_schema`];

      const paramsToParse = rawParameters || rawArguments || rawInputSchema;

      const parameters = typeof paramsToParse === "string" ? paramsToParse : JSON.stringify(paramsToParse || {});

      return name ? { name, description, parameters } : null;
    })
  );
};

/**
 * Resolve a span's tools, preferring the dedup'd `tool_definitions`
 * column and falling back to per-attribute extraction for legacy spans.
 */
export const resolveTools = (span: { toolDefinitions?: string | null; attributes?: Record<string, any> }): Tool[] => {
  const fromColumn = extractToolsFromColumn(span.toolDefinitions);
  if (fromColumn.length > 0) return fromColumn;
  return extractToolsFromAttributes(span.attributes ?? {});
};

export const ToolList = ({ tools }: { tools: Tool[] }) => {
  if (tools.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-6 w-fit items-center gap-1 rounded-md pl-2 pr-1.5 text-xs bg-tool/15 text-tool hover:bg-tool/25 data-[state=open]:bg-tool/35 transition-colors outline-0 [&[data-state=open]_.trigger-closed]:hidden [&:not([data-state=open])_.trigger-open]:hidden">
          <Bolt size={12} className="min-w-3" />
          <span>{pluralize(tools.length, "tool", "tools")}</span>
          <ChevronRight className="trigger-closed size-3" />
          <ChevronDown className="trigger-open size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-96 max-w-(--radix-dropdown-menu-content-available-width) overflow-hidden p-0"
        align="start"
        side="bottom"
      >
        <ScrollArea className="w-full max-h-[50vh]" viewportClassName="max-h-[50vh] [&>div]:!block [&>div]:!w-full">
          <div className="flex w-full min-w-0 flex-col gap-1 p-1">
            {tools.map((tool, index) => (
              <details
                key={index}
                className="w-full min-w-0 overflow-hidden rounded-md bg-surface-up text-xs [&[open]_.parameters-closed]:hidden [&:not([open])_.parameters-open]:hidden"
              >
                <summary
                  className={
                    tool.parameters
                      ? "group min-w-0 cursor-pointer list-none overflow-hidden p-2 pb-1"
                      : "min-w-0 list-none overflow-hidden p-2 pb-1"
                  }
                >
                  <div className="mb-1 flex min-w-0 items-center gap-2">
                    <Bolt size={10} className="shrink-0 text-tool" />
                    <Label className="min-w-0 break-all text-xs font-mono text-tool">{tool.name}</Label>
                  </div>
                  {tool.description && (
                    <p className="mb-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                  )}
                  {tool.parameters && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground select-none">
                      Parameters
                      <ChevronRight className="parameters-closed size-3" />
                      <ChevronDown className="parameters-open size-3" />
                    </span>
                  )}
                </summary>
                {tool.parameters && (
                  <ContentRenderer
                    readOnly
                    value={tool.parameters}
                    defaultMode="json"
                    className="w-full min-w-0 rounded-none border-x-0 border-b-0 bg-surface-up-2 border-none"
                  />
                )}
              </details>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
