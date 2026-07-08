import { Bolt, ChevronDown } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Tool } from "@/lib/spans/tools";
import { pluralize } from "@/lib/utils";

import ContentRenderer from "../ui/content-renderer/index";
import { Label } from "../ui/label";

// Extraction logic lives in lib/spans/tools so server code (trace token
// breakdown) can use it without pulling in this UI module.
export { extractToolsFromAttributes, extractToolsFromColumn, resolveTools, type Tool } from "@/lib/spans/tools";

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
