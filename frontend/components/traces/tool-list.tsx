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

export const extractToolsFromAttributes = (attributes: Record<string, any>): Tool[] => {
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
      const rawArguments = attributes[`llm.request.functions.${index}.arguments`];
      const rawInputSchema = attributes[`llm.request.functions.${index}.input_schema`];

      const paramsToParse = rawParameters || rawArguments || rawInputSchema;

      const parameters = typeof paramsToParse === "string" ? paramsToParse : JSON.stringify(paramsToParse || {});

      return name ? { name, description, parameters } : null;
    })
  );
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
