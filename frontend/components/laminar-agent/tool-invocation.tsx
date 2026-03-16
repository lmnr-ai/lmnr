"use client";

import { Check, ChevronRight, Copy, Database, ExternalLink, Loader2, Route } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { v4 } from "uuid";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/hooks/use-toast";
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
  const [copied, setCopied] = useState(false);
  const { projectId } = useParams();
  const query = (input as { query?: string })?.query;
  const isLoading = state === "input-streaming" || state === "input-available";

  const copyQuery = useCallback(async () => {
    if (!query) return;
    await navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [query]);

  const openInEditor = useCallback(async () => {
    if (!query) return;
    const id = v4();
    try {
      const res = await fetch(`/api/projects/${projectId}/sql/templates`, {
        method: "POST",
        body: JSON.stringify({ id, name: "Agent query", query }),
      });
      if (res.ok) {
        window.open(`/project/${projectId}/sql/${id}`, "_blank");
      }
    } catch {
      toast({ title: "Failed to open in SQL editor", variant: "destructive" });
    }
  }, [projectId, query]);

  return (
    <div className="bg-muted/50 rounded-lg border text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <button
          className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {isLoading ? "Executing SQL query..." : "Executed SQL query"}
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-200", expanded && "rotate-90")} />
        </button>
        {!isLoading && query && (
          <div className="flex items-center gap-0.5 ml-auto">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyQuery} aria-label="Copy SQL">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={openInEditor}
              aria-label="Open in SQL editor"
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
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
