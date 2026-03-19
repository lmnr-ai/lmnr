"use client";

import { ChevronDown, ChevronRight, Database, ListTree, Loader2 } from "lucide-react";
import { useState } from "react";

import CodeHighlighter from "@/components/ui/code-highlighter";
import { CopyButton } from "@/components/ui/copy-button";

interface CompactTraceCardProps {
  isLoading?: boolean;
}

export function CompactTraceCard({ isLoading }: CompactTraceCardProps) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 border">
      <div className="flex items-center gap-2">
        <ListTree className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">
          {isLoading ? "Fetching trace context..." : "Fetched trace context"}
        </span>
        {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

interface SqlToolCardProps {
  query: string;
  isLoading?: boolean;
}

export function SqlToolCard({ query, isLoading }: SqlToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-muted/50 rounded-lg border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/80 transition-colors rounded-lg"
      >
        <Database className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground flex-1">
          {isLoading ? "Executing SQL query..." : "Executed SQL query"}
        </span>
        {isLoading ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex items-center gap-1">
            {expanded && query && (
              <CopyButton size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground" text={query} />
            )}
            {expanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
          </div>
        )}
      </button>
      {expanded && query && (
        <div className="px-3 pb-3 border-t">
          <div className="pt-2">
            <CodeHighlighter language="sql" code={query} />
          </div>
        </div>
      )}
    </div>
  );
}
