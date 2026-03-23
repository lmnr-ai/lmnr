"use client";

import React from "react";

/**
 * Matches XML-like span references in text:
 *   <span id='123' name='my-span' />
 *   <span id='123' name='my-span' reference_text='...' />
 */
const SPAN_REF_REGEX = /<span\s+id='(\d+)'\s+name='([^']+)'(?:\s+reference_text='(.*?)')?\s*\/>/g;

export interface SpanReferenceCallbacks {
  resolveSpanId: (sequentialId: string) => Promise<string | null>;
  onSelectSpan: (spanUuid: string) => void;
  onSearchSpans?: (search: string) => void;
}

interface SpanBadgeProps {
  spanId: string;
  spanName: string;
  referenceText?: string;
  callbacks: SpanReferenceCallbacks;
}

function SpanBadge({ spanId, spanName, referenceText, callbacks }: SpanBadgeProps) {
  const handleClick = async () => {
    if (referenceText && callbacks.onSearchSpans) {
      callbacks.onSearchSpans(referenceText);
    }
    const spanUuid = await callbacks.resolveSpanId(spanId);
    if (spanUuid) {
      callbacks.onSelectSpan(spanUuid);
    }
  };

  if (referenceText) {
    const unescaped = referenceText.replace(/\\"/g, '"');
    const previewLength = 24;
    const textPreview = unescaped.length > previewLength ? unescaped.slice(0, previewLength) + "..." : unescaped;

    return (
      <button onClick={handleClick}>
        <span className="bg-primary/70 rounded px-1.5 py-0.5 font-mono text-xs mr-1">{spanName}</span>
        span
        <span className="text-xs text-muted-foreground ml-1 font-mono">({textPreview})</span>
      </button>
    );
  }

  return (
    <button onClick={handleClick}>
      <span className="bg-primary/70 rounded px-1.5 py-0.5 font-mono text-xs">{spanName}</span> span
    </button>
  );
}

/**
 * Renders a string with span references replaced by clickable badges.
 * Non-matching text is rendered as-is.
 */
export function renderSpanReferences(text: string, callbacks: SpanReferenceCallbacks): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  SPAN_REF_REGEX.lastIndex = 0;

  while ((match = SPAN_REF_REGEX.exec(text)) !== null) {
    const [fullMatch, spanId, spanName, referenceText] = match;

    // Add preceding text
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <SpanBadge
        key={`span-ref-${match.index}`}
        spanId={spanId}
        spanName={spanName}
        referenceText={referenceText}
        callbacks={callbacks}
      />
    );

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // No span references found — return null to indicate plain text
  if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === "string")) {
    return null;
  }

  return <>{parts}</>;
}

/**
 * Check if a string contains span references.
 */
export function hasSpanReferences(text: string): boolean {
  SPAN_REF_REGEX.lastIndex = 0;
  return SPAN_REF_REGEX.test(text);
}
