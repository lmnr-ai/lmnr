"use client";

import { AlertCircle, ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export interface ErrorSummaryItem {
  spanName: string;
  spanType: string;
  errorType: string;
  errorMessage: string;
  stacktracePreview?: string;
}

export interface ErrorSummaryData {
  traceId: string;
  errorCount: number;
  errors: ErrorSummaryItem[];
}

export function ErrorSummary({ data }: { data: ErrorSummaryData }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="rounded-lg border border-destructive/30 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-destructive/20 bg-destructive/5">
        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
        <span className="text-sm font-medium text-destructive">
          {data.errorCount} {data.errorCount === 1 ? "Error" : "Errors"} Found
        </span>
      </div>

      {/* Error list */}
      <div className="divide-y divide-border/40 max-h-64 overflow-auto minimal-scrollbar">
        {data.errors.map((error, i) => {
          const isExpanded = expandedIndex === i;
          return (
            <div key={i} className="hover:bg-muted/20">
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className="w-full text-left px-3 py-2 flex items-start gap-2"
              >
                <ChevronDown
                  className={cn(
                    "w-3 h-3 text-muted-foreground shrink-0 mt-0.5 transition-transform",
                    isExpanded && "rotate-180"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] bg-destructive/20 text-destructive px-1 rounded">{error.spanType}</span>
                    <span className="text-[11px] font-medium truncate">{error.spanName}</span>
                  </div>
                  <div className="text-[11px] text-destructive/80 truncate">
                    {error.errorType}: {error.errorMessage}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-2 ml-5">
                  <div className="bg-muted/40 rounded p-2 border border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1">Error Type</p>
                    <p className="text-[11px] font-mono text-destructive mb-2">{error.errorType}</p>
                    <p className="text-[10px] text-muted-foreground mb-1">Message</p>
                    <p className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all">
                      {error.errorMessage}
                    </p>
                    {error.stacktracePreview && (
                      <>
                        <p className="text-[10px] text-muted-foreground mt-2 mb-1">Stack Trace (preview)</p>
                        <p className="text-[10px] font-mono text-foreground/60 whitespace-pre-wrap break-all">
                          {error.stacktracePreview}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
