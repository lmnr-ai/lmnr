"use client";

import { AlertCircle, Bot, CheckCircle2, ChevronDown, ChevronRight, Cpu, Wrench } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export interface SpanTreeNode {
  spanId: string;
  name: string;
  spanType: string;
  durationMs: number;
  status?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  children: SpanTreeNode[];
}

export interface SpanTreeData {
  traceId: string;
  rootSpans: SpanTreeNode[];
  totalDurationMs: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function SpanTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "LLM":
      return <Bot className="w-3 h-3 text-blue-500" />;
    case "TOOL":
      return <Wrench className="w-3 h-3 text-orange-500" />;
    default:
      return <Cpu className="w-3 h-3 text-muted-foreground" />;
  }
}

function SpanNode({ node, totalDurationMs, depth }: { node: SpanTreeNode; totalDurationMs: number; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSuccess = !node.status || node.status === "OK" || node.status === "success";
  const widthPct = Math.max((node.durationMs / totalDurationMs) * 100, 3);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-0.5 px-1 rounded hover:bg-muted/50 cursor-default group",
          !isSuccess && "bg-destructive/5"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Expand/collapse */}
        <span className="w-3 flex-none">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )
          ) : null}
        </span>

        {/* Type icon */}
        <SpanTypeIcon type={node.spanType} />

        {/* Name */}
        <span className="text-[11px] font-mono truncate flex-1 min-w-0">{node.name}</span>

        {/* Model badge */}
        {node.model && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-none">{node.model}</span>
        )}

        {/* Token info */}
        {node.inputTokens != null && node.outputTokens != null && (
          <span className="text-[9px] text-muted-foreground font-mono flex-none">
            {node.inputTokens}→{node.outputTokens}
          </span>
        )}

        {/* Duration bar */}
        <div className="w-16 h-2.5 bg-muted/50 rounded-sm overflow-hidden flex-none">
          <div
            className={cn("h-full rounded-sm", isSuccess ? "bg-primary/30" : "bg-destructive/30")}
            style={{ width: `${widthPct}%` }}
          />
        </div>

        {/* Duration text */}
        <span className="text-[10px] font-mono text-muted-foreground w-10 text-right flex-none">
          {formatDuration(node.durationMs)}
        </span>

        {/* Status */}
        {isSuccess ? (
          <CheckCircle2 className="w-3 h-3 text-green-500 flex-none" />
        ) : (
          <AlertCircle className="w-3 h-3 text-destructive flex-none" />
        )}
      </div>

      {/* Children */}
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <SpanNode key={child.spanId} node={child} totalDurationMs={totalDurationMs} depth={depth + 1} />
        ))}
    </div>
  );
}

export function SpanTreeView({ data }: { data: SpanTreeData }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-1.5 border-b bg-muted/30">
        <span className="text-[11px] font-medium text-muted-foreground">Span Tree</span>
      </div>
      <div className="py-1 max-h-64 overflow-y-auto minimal-scrollbar">
        {data.rootSpans.map((root) => (
          <SpanNode key={root.spanId} node={root} totalDurationMs={data.totalDurationMs} depth={0} />
        ))}
      </div>
    </div>
  );
}
