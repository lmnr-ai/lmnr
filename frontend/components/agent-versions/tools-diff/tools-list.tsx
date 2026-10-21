"use client";

import { useMemo } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";

import ToolRow from "./tool-row";
import { listTools } from "./utils";

interface ToolsListProps {
  text: string;
}

/** One row per tool of a version, for the initial version where there is nothing to diff. */
export default function ToolsList({ text }: ToolsListProps) {
  const tools = useMemo(() => listTools(text), [text]);

  if (tools.length === 0) {
    return <div className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground">No tools</div>;
  }

  return (
    <div className="flex flex-col divide-y rounded-md border">
      {tools.map((tool) => (
        <ToolRow
          key={tool.name}
          name={tool.name}
          meta={
            <span className="text-muted-foreground">
              {tool.lines} line{tool.lines === 1 ? "" : "s"}
            </span>
          }
        >
          <ScrollArea className="rounded-md border bg-muted/30 max-h-96 [&>div]:max-h-96">
            <div className="px-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
              {tool.text}
            </div>
          </ScrollArea>
        </ToolRow>
      ))}
    </div>
  );
}
