"use client";

import React from "react";

import { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { parseSpanLinks } from "@/lib/traces/span-link-parsing";
import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

// Matches XML span refs <span id='abc123' name='...' [reference_text='...']/> where id is the 6-hex short id
// (last 6 chars of the span UUID). See app-server/src/traces/span_helpers.rs::span_short_id.
const SPAN_REF_REGEX = /<span\s+id='([0-9a-f]{6})'\s+name='([^']+)'(?:\s+reference_text='(.*?)')?\s*\/>/gi;

export interface SpanReferenceCallbacks {
  onSelectSpan: (spanUuid: string) => void;
}

function SpanLink({
  spanId,
  fallbackName,
  onSelectSpan,
}: {
  spanId: string;
  fallbackName: string;
  onSelectSpan: (spanUuid: string) => void;
}) {
  const span = useTraceViewBaseStore((state) => {
    const lower = spanId.toLowerCase();
    return state.spans.find((s) => s.spanId.toLowerCase() === lower || s.spanId.toLowerCase().endsWith(lower)) ?? null;
  });
  const disabled = span === null;
  const spanType = span?.spanType ?? SpanType.DEFAULT;
  const handleClick = () => {
    if (span) onSelectSpan(span.spanId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? "Span not loaded" : `Open ${fallbackName}`}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded align-middle transition-colors p-1",
        disabled ? "border-border/40 bg-muted/40 cursor-not-allowed" : "border-landing-text-300/20 hover:bg-muted"
      )}
    >
      <span
        className="inline-flex items-center justify-center rounded size-4 shrink-0"
        style={{ backgroundColor: SPAN_TYPE_TO_COLOR[spanType] ?? SPAN_TYPE_TO_COLOR[SpanType.DEFAULT] }}
      >
        {createSpanTypeIcon(spanType, "w-3 h-3 text-white", 12)}
      </span>
      <span className={cn("min-w-0 truncate text-xs text-secondary-foreground", disabled && "opacity-60")}>
        {fallbackName}
      </span>
    </button>
  );
}

interface SpanMatch {
  index: number;
  length: number;
  node: React.ReactNode;
}

function collectMatches(text: string, callbacks: SpanReferenceCallbacks): SpanMatch[] {
  const matches: SpanMatch[] = [];

  SPAN_REF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPAN_REF_REGEX.exec(text)) !== null) {
    const [fullMatch, shortId, embeddedName] = match;
    matches.push({
      index: match.index,
      length: fullMatch.length,
      node: (
        <SpanLink
          key={`xml-ref-${match.index}`}
          spanId={shortId}
          fallbackName={embeddedName}
          onSelectSpan={callbacks.onSelectSpan}
        />
      ),
    });
  }

  for (const link of parseSpanLinks(text)) {
    if (!link.spanId) continue;
    matches.push({
      index: link.index,
      length: link.length,
      node: (
        <SpanLink
          key={`md-ref-${link.index}`}
          spanId={link.spanId}
          fallbackName={link.label}
          onSelectSpan={callbacks.onSelectSpan}
        />
      ),
    });
  }

  matches.sort((a, b) => a.index - b.index);
  return matches;
}

export function renderSpanReferences(text: string, callbacks: SpanReferenceCallbacks): React.ReactNode {
  const matches = collectMatches(text, callbacks);

  if (matches.length === 0) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const m of matches) {
    if (m.index < lastIndex) continue;

    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    parts.push(m.node);
    lastIndex = m.index + m.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
