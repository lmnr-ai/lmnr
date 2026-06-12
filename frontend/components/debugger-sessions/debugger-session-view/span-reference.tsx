"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";

import { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

// Module-level so re-renders/remounts and repeated references share one fetch.
const spanTypeCache = new Map<string, Promise<SpanType | null>>();

function resolveSpanType(projectId: string, traceId: string, spanId: string): Promise<SpanType | null> {
  const key = `${projectId}:${spanId}`;
  const cached = spanTypeCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/traces/${traceId}/spans/${spanId}/type`);
      if (!res.ok) throw new Error("Failed to resolve span type");
      const data = (await res.json()) as { spanType?: SpanType };
      return data.spanType ?? null;
    } catch {
      // Don't poison the cache — a later mount can retry.
      spanTypeCache.delete(key);
      return null;
    }
  })();
  spanTypeCache.set(key, promise);
  return promise;
}

/** Prefers the store-provided type (live/expanded — zero fetches); otherwise resolves via API. */
function useResolvedSpanType(traceId: string, spanId: string, spanType: SpanType | undefined) {
  const { projectId } = useParams<{ projectId: string }>();
  const [resolved, setResolved] = useState<SpanType | null>(null);

  useEffect(() => {
    if (spanType || !projectId) return;
    let cancelled = false;
    resolveSpanType(projectId, traceId, spanId).then((type) => {
      if (!cancelled && type) setResolved(type);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, traceId, spanId, spanType]);

  return spanType ?? resolved ?? undefined;
}

/** SpanChip that resolves its own span type when the store doesn't have it (e.g. after reload). */
export function SelfResolvingSpanChip({
  label,
  traceId,
  spanId,
  spanType,
  onClick,
}: {
  label: React.ReactNode;
  traceId: string;
  spanId: string;
  spanType: SpanType | undefined;
  onClick: () => void;
}) {
  const resolvedType = useResolvedSpanType(traceId, spanId, spanType);
  return <SpanChip label={label} spanType={resolvedType} onClick={onClick} />;
}

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
