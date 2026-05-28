"use client";

import React from "react";

import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { parseSpanLinks } from "@/lib/traces/span-link-parsing";
import { cn } from "@/lib/utils";

// Matches XML span refs <span id='abc123' name='...' [reference_text='...']/> where id is the 6-hex short id
// (last 6 chars of the span UUID). See app-server/src/traces/span_helpers.rs::span_short_id.
const SPAN_REF_REGEX = /<span\s+id='([0-9a-f]{6})'\s+name='([^']+)'(?:\s+reference_text='(.*?)')?\s*\/>/gi;

export interface SpanReferenceCallbacks {
  onSelectSpan: (spanUuid: string) => void;
}

// Subscribes to the trace-view store directly so each link re-renders when spans load,
// regardless of upstream Streamdown block memoization.
function SpanLink({
  spanId,
  fallbackName,
  referenceText,
  onSelectSpan,
}: {
  spanId: string;
  fallbackName: string;
  referenceText?: string;
  onSelectSpan: (spanUuid: string) => void;
}) {
  const resolved = useTraceViewBaseStore((state) => {
    const lower = spanId.toLowerCase();
    const match = state.spans.find((s) => s.spanId.toLowerCase() === lower || s.spanId.toLowerCase().endsWith(lower));
    return match ? match.spanId : null;
  });
  const disabled = resolved === null;
  const handleClick = () => {
    if (resolved) onSelectSpan(resolved);
  };

  const preview = referenceText ? truncateRef(referenceText) : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? "Span not loaded" : `Open ${fallbackName}`}
      className={cn(
        "font-mono text-[12px] underline-offset-2 inline align-baseline",
        disabled
          ? "text-muted-foreground cursor-not-allowed"
          : "text-primary hover:text-primary/80 hover:underline cursor-pointer"
      )}
    >
      {fallbackName}
      {preview && <span className="text-muted-foreground"> ({preview})</span>}
    </button>
  );
}

function truncateRef(text: string): string {
  const unescaped = text.replace(/\\"/g, '"');
  return unescaped.length > 24 ? unescaped.slice(0, 24) + "…" : unescaped;
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
    const [fullMatch, shortId, embeddedName, referenceText] = match;
    matches.push({
      index: match.index,
      length: fullMatch.length,
      node: (
        <SpanLink
          key={`xml-ref-${match.index}`}
          spanId={shortId}
          fallbackName={embeddedName}
          referenceText={referenceText}
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
