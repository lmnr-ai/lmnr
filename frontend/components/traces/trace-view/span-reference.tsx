"use client";

import React from "react";

import { parseSpanLinks } from "@/lib/traces/span-link-parsing";

/**
 * Matches XML-like span references in text:
 *   <span id='123' name='my-span' />
 *   <span id='123' name='my-span' reference_text='...' />
 */
const SPAN_REF_REGEX = /<span\s+id='(\d+)'\s+name='([^']+)'(?:\s+reference_text='(.*?)')?\s*\/>/g;

export interface SpanReferenceCallbacks {
  resolveSpanId: (sequentialId: string) => Promise<string | null>;
  onSelectSpan: (spanUuid: string) => void;
}

interface SpanBadgeProps {
  spanId: string;
  spanName: string;
  referenceText?: string;
  callbacks: SpanReferenceCallbacks;
}

/** Badge for markdown-style span links — spanUuid is already resolved */
function MarkdownSpanBadge({
  label,
  spanUuid,
  onSelectSpan,
}: {
  label: string;
  spanUuid: string;
  onSelectSpan: (spanUuid: string) => void;
}) {
  return (
    <button onClick={() => onSelectSpan(spanUuid)}>
      <span className="bg-primary/70 text-primary-foreground rounded px-1.5 py-0.5 font-mono text-xs">{label}</span>{" "}
      span
    </button>
  );
}

function SpanBadge({ spanId, spanName, referenceText, callbacks }: SpanBadgeProps) {
  const handleClick = async () => {
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
        <span className="bg-primary/70 text-primary-foreground rounded px-1.5 py-0.5 font-mono text-xs mr-1">
          {spanName}
        </span>
        span
        <span className="text-xs text-muted-foreground ml-1 font-mono">({textPreview})</span>
      </button>
    );
  }

  return (
    <button onClick={handleClick}>
      <span className="bg-primary/70 text-primary-foreground rounded px-1.5 py-0.5 font-mono text-xs">{spanName}</span>{" "}
      span
    </button>
  );
}

/**
 * Collect all span reference matches (XML and markdown) and sort by position.
 */
interface SpanMatch {
  index: number;
  length: number;
  node: React.ReactNode;
}

function collectMatches(text: string, callbacks: SpanReferenceCallbacks): SpanMatch[] {
  const matches: SpanMatch[] = [];

  // XML-style: <span id='123' name='my-span' />
  SPAN_REF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPAN_REF_REGEX.exec(text)) !== null) {
    const [fullMatch, spanId, spanName, referenceText] = match;
    matches.push({
      index: match.index,
      length: fullMatch.length,
      node: (
        <SpanBadge
          key={`xml-ref-${match.index}`}
          spanId={spanId}
          spanName={spanName}
          referenceText={referenceText}
          callbacks={callbacks}
        />
      ),
    });
  }

  // Markdown-style: [Label](https://...?spanId=UUID)
  // Only links with a spanId are actionable here — the trace-view already has
  // a fixed traceId, so cross-trace links without spanId aren't useful as badges.
  for (const link of parseSpanLinks(text)) {
    if (!link.spanId) continue;
    matches.push({
      index: link.index,
      length: link.length,
      node: (
        <MarkdownSpanBadge
          key={`md-ref-${link.index}`}
          label={link.label}
          spanUuid={link.spanId}
          onSelectSpan={callbacks.onSelectSpan}
        />
      ),
    });
  }

  // Sort by position so we can iterate left-to-right
  matches.sort((a, b) => a.index - b.index);
  return matches;
}

/**
 * Renders a string with span references replaced by clickable badges.
 * Handles both XML-style (<span id='...' name='...' />) and
 * markdown-style ([Label](url?spanId=UUID)) references.
 * Non-matching text is rendered as-is.
 */
export function renderSpanReferences(text: string, callbacks: SpanReferenceCallbacks): React.ReactNode {
  const matches = collectMatches(text, callbacks);

  if (matches.length === 0) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const m of matches) {
    // Skip overlapping matches
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
