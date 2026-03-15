"use client";

import { ChevronRight, Database, Loader2, Route } from "lucide-react";
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
  const [showFullOutput, setShowFullOutput] = useState(false);
  const query = (input as { query?: string })?.query;
  const isLoading = state === "input-streaming" || state === "input-available";

  return (
    <div className="bg-muted/50 rounded-lg border text-xs">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-muted-foreground">
          {isLoading ? "Executing SQL query..." : "Executed SQL query"}
        </span>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {query && (
            <pre className="bg-background rounded p-2 overflow-x-auto text-[13px] text-foreground/80 font-mono whitespace-pre-wrap">
              {query}
            </pre>
          )}
          {state === "output-available" && output != null && (
            <ResultPreview
              output={output}
              showFull={showFullOutput}
              onToggle={() => setShowFullOutput(!showFullOutput)}
            />
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
        {traceId && (
          <span className="font-mono text-foreground/70 truncate max-w-[200px]" title={traceId}>
            {traceId}
          </span>
        )}
      </div>
    </div>
  );
}

const TRUNCATE_MAX_LENGTH = 500;

function formatOutput(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

function ResultPreview({ output, showFull, onToggle }: { output: unknown; showFull: boolean; onToggle: () => void }) {
  const fullText = formatOutput(output);
  const isTruncated = fullText.length > TRUNCATE_MAX_LENGTH;
  const displayText = showFull || !isTruncated ? fullText : fullText.slice(0, TRUNCATE_MAX_LENGTH) + "\n...";

  return (
    <div className="space-y-1">
      <span className="text-muted-foreground font-medium">Result preview</span>
      <pre className="bg-background rounded p-2 overflow-x-auto text-[13px] text-foreground/80 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
        {displayText}
      </pre>
      {isTruncated && (
        <button className="text-muted-foreground hover:text-foreground transition-colors text-xs" onClick={onToggle}>
          {showFull ? "Show less" : `Show more (${fullText.length.toLocaleString()} chars total)`}
        </button>
      )}
    </div>
  );
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
