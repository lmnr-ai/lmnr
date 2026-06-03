"use client";

import React from "react";

import { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

/**
 * Inline span-reference chip used inside debugger run comments. Styling mirrors
 * the Ask-AI span chip from `refactor/trace-view-header-signals-clean`: a small
 * span-type-colored icon backdrop plus the label in muted text. Clicking opens
 * the span view for the referenced (trace, span).
 */
export function SpanChip({
  label,
  spanType,
  onClick,
}: {
  label: React.ReactNode;
  spanType: SpanType | undefined;
  onClick: () => void;
}) {
  const resolvedType = spanType ?? SpanType.DEFAULT;
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-landing-text-300/20 bg-landing-text-300/20 pl-1 pr-1.5 align-middle hover:bg-landing-text-300/30 transition-colors"
    >
      <span
        className="inline-flex items-center justify-center rounded size-4 shrink-0"
        style={{ backgroundColor: SPAN_TYPE_TO_COLOR[resolvedType] ?? SPAN_TYPE_TO_COLOR[SpanType.DEFAULT] }}
      >
        {createSpanTypeIcon(resolvedType, "w-3 h-3 text-white", 12)}
      </span>
      <span className="text-sm text-secondary-foreground">{label}</span>
    </button>
  );
}
