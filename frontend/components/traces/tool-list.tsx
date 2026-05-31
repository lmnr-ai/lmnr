import { compact, get, isNil, sortBy, uniq } from "lodash";
import { Bolt, ChevronDown } from "lucide-react";

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
