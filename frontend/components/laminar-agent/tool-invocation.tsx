"use client";

import { ChevronDown, ChevronRight, Database, Loader2, Route } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface ToolInvocationProps {
  toolName: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

function QuerySQLInvocation({ state, input, output }: Omit<ToolInvocationProps, "toolName">) {
  const [expanded, setExpanded] = useState(false);
  const query = (input as { query?: string })?.query;
  const isLoading = state === "input-streaming" || state === "input-available";

  return (
    <div className="bg-muted/50 rounded-lg border text-xs">
      <button className="flex items-center gap-2 w-full px-3 py-2" onClick={() => setExpanded(!expanded)}>
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-muted-foreground">
          {isLoading ? "Executing SQL query..." : "Executed SQL query"}
        </span>
        <div className="ml-auto">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {query && (
            <pre className="bg-background rounded p-2 overflow-x-auto text-foreground/80 font-mono whitespace-pre-wrap">
              {query}
            </pre>
          )}
          {state === "output-available" && output != null && (
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium">Result preview</span>
              <pre className="bg-background rounded p-2 overflow-x-auto text-foreground/80 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                {typeof output === "string" ? truncateOutput(output) : truncateOutput(JSON.stringify(output, null, 2))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TraceSkeletonInvocation({ state, input }: Omit<ToolInvocationProps, "toolName">) {
  const traceId = (input as { traceId?: string })?.traceId;
  const isLoading = state === "input-streaming" || state === "input-available";

  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2 border text-xs">
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <Route className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-muted-foreground">
          {isLoading ? "Fetching trace structure..." : "Fetched trace structure"}
        </span>
        {traceId && <span className={cn("font-mono text-foreground/70 truncate max-w-[200px]")}>{traceId}</span>}
      </div>
    </div>
  );
}

function truncateOutput(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n... (truncated)";
}

export default function ToolInvocation({ toolName, state, input, output }: ToolInvocationProps) {
  if (toolName === "querySQL") {
    return <QuerySQLInvocation state={state} input={input} output={output} />;
  }
  if (toolName === "getTraceSkeleton") {
    return <TraceSkeletonInvocation state={state} input={input} />;
  }

  // Fallback for unknown tools
  const isLoading = state === "input-streaming" || state === "input-available";
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2 border text-xs">
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Database className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="font-medium text-muted-foreground">
          {isLoading ? `Calling ${toolName}...` : `Called ${toolName}`}
        </span>
      </div>
    </div>
  );
}
