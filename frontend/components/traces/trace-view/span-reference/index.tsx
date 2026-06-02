"use client";

import { ArrowUpRight } from "lucide-react";
import React, { useEffect, useState } from "react";

import { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { parseSpanLinks } from "@/lib/traces/span-link-parsing";
import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

const SPAN_REF_REGEX = /<span\s+id='([0-9a-f]{6})'\s+name='([^']+)'(?:\s+reference_text='(.*?)')?\s*\/>/gi;

/**
 * Navigation target for a span reference. `traceId` is only carried by markdown
 * links (which may point at a different trace than the one being viewed);
 * consumers that select within a single trace can ignore it.
 */
export interface SpanRefTarget {
  traceId?: string;
  spanId?: string;
}

export interface SpanReferenceCallbacks {
  resolveSpanId: (sequentialId: string) => Promise<{ uuid: string; type: SpanType } | null>;
  getSpanType: (uuid: string) => SpanType | undefined;
  onSelectSpan: (target: SpanRefTarget) => void;
}

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
      onClick={(e) => {
        // The badge can live inside clickable rows / anchors (e.g. the signal
        // events table), so stop the click from also triggering row navigation.
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded px-1 underline py-0.5 align-middle hover:bg-landing-text-300/30 transition-colors cursor-pointer"
    >
      <span
        className="inline-flex items-center justify-center rounded size-4 shrink-0"
        style={{ backgroundColor: SPAN_TYPE_TO_COLOR[resolvedType] ?? SPAN_TYPE_TO_COLOR[SpanType.DEFAULT] }}
      >
        {createSpanTypeIcon(resolvedType, "w-3 h-3 text-white", 12)}
      </span>
      <span className={`text-sm text-secondary-foreground ${loading ? "opacity-60" : ""}`}>{name}</span>
      <ArrowUpRight className="w-3.5 h-3.5" />
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
      callbacks.onSelectSpan({ spanId: resolved.uuid });
      return;
    }
    // Mount-fetch still in flight (or not yet started) — resolve inline so
    // clicks before the icon backdrop appears don't silently no-op.
    const r = await callbacks.resolveSpanId(spanId);
    if (r) callbacks.onSelectSpan({ spanId: r.uuid });
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
  traceId,
  spanUuid,
  callbacks,
}: {
  label: string;
  traceId: string;
  spanUuid?: string;
  callbacks: SpanReferenceCallbacks;
}) {
  const spanType = spanUuid ? callbacks.getSpanType(spanUuid) : undefined;
  return (
    <SpanChip name={label} spanType={spanType} onClick={() => callbacks.onSelectSpan({ traceId, spanId: spanUuid })} />
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

  for (const link of parseSpanLinks(text)) {
    matches.push({
      index: link.index,
      length: link.length,
      node: (
        <MarkdownSpanBadge
          key={`md-ref-${link.index}`}
          label={link.label}
          traceId={link.traceId}
          spanUuid={link.spanId}
          callbacks={callbacks}
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
