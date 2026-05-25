"use client";

import React, { useEffect, useState } from "react";

import { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { parseSpanLinks } from "@/lib/traces/span-link-parsing";
import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

/**
 * Matches XML-like span references in text:
 *   <span id='123' name='my-span' />
 *   <span id='123' name='my-span' reference_text='...' />
 */
const SPAN_REF_REGEX = /<span\s+id='(\d+)'\s+name='([^']+)'(?:\s+reference_text='(.*?)')?\s*\/>/g;

export interface SpanReferenceCallbacks {
  /** XML refs: resolve sequential id → uuid + type via the agent endpoint. */
  resolveSpanId: (sequentialId: string) => Promise<{ uuid: string; type: SpanType } | null>;
  /** Markdown refs: sync lookup of type from already-loaded store spans. */
  getSpanType: (uuid: string) => SpanType | undefined;
  onSelectSpan: (spanUuid: string) => void;
}

/**
 * Shared chip rendering: 16px icon container colored by span type, plus the
 * span name in muted text. Used by both XML and markdown badges.
 */
function SpanChip({
  name,
  spanType,
  onClick,
  loading,
}: {
  name: string;
  spanType: SpanType | undefined;
  onClick: () => void;
  loading?: boolean;
}) {
  const resolvedType = spanType ?? SpanType.DEFAULT;
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-landing-text-300/20 bg-landing-text-300/20 pl-1 pr-1.5 align-middle hover:bg-landing-text-300/30 transition-colors"
    >
      <span
        className="inline-flex items-center justify-center rounded size-3.5 shrink-0"
        style={{ backgroundColor: SPAN_TYPE_TO_COLOR[resolvedType] ?? SPAN_TYPE_TO_COLOR[SpanType.DEFAULT] }}
      >
        {createSpanTypeIcon(resolvedType, "w-3 h-3 text-white", 12)}
      </span>
      <span className={`text-xs text-secondary-foreground ${loading ? "opacity-60" : ""}`}>{name}</span>
    </button>
  );
}

/** Badge for XML span refs — resolves sequential id → uuid+type on mount. */
function SpanBadge({
  spanId,
  spanName,
  referenceText,
  callbacks,
}: {
  spanId: string;
  spanName: string;
  referenceText?: string;
  callbacks: SpanReferenceCallbacks;
}) {
  const [resolved, setResolved] = useState<{ uuid: string; type: SpanType } | null>(null);

  useEffect(() => {
    let cancelled = false;
    callbacks.resolveSpanId(spanId).then((r) => {
      if (!cancelled) setResolved(r);
    });
    return () => {
      cancelled = true;
    };
  }, [spanId, callbacks]);

  const handleClick = async () => {
    if (resolved) {
      callbacks.onSelectSpan(resolved.uuid);
      return;
    }
    // Mount-fetch still in flight (or not yet started) — resolve inline so
    // clicks before the icon backdrop appears don't silently no-op.
    const r = await callbacks.resolveSpanId(spanId);
    if (r) callbacks.onSelectSpan(r.uuid);
  };

  if (referenceText) {
    const unescaped = referenceText.replace(/\\"/g, '"');
    const previewLength = 24;
    const textPreview = unescaped.length > previewLength ? unescaped.slice(0, previewLength) + "..." : unescaped;
    return (
      <>
        <SpanChip name={spanName} spanType={resolved?.type} onClick={handleClick} loading={!resolved} />
        <span className="text-xs text-muted-foreground ml-1 font-mono">({textPreview})</span>
      </>
    );
  }

  return <SpanChip name={spanName} spanType={resolved?.type} onClick={handleClick} loading={!resolved} />;
}

/** Badge for markdown span refs — uuid known, type resolved sync from store. */
function MarkdownSpanBadge({
  label,
  spanUuid,
  callbacks,
}: {
  label: string;
  spanUuid: string;
  callbacks: SpanReferenceCallbacks;
}) {
  const spanType = callbacks.getSpanType(spanUuid);
  return <SpanChip name={label} spanType={spanType} onClick={() => callbacks.onSelectSpan(spanUuid)} />;
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
          callbacks={callbacks}
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
