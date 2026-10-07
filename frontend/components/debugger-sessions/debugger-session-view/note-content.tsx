"use client";

import { type ComponentProps, useMemo } from "react";

import { Response } from "@/components/ai-elements/response";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { cn } from "@/lib/utils";

import { noteMarkdownComponents, noteProseClassName, spanTagsToLinks } from "./note-markdown";
import { SelfResolvingSpanChip, SpanChip } from "./span-reference";
import { useDebuggerSessionViewStore } from "./store";

const REFERENCE_TEXT_PREVIEW_LEN = 24;

/**
 * Renders a note (markdown) with agent `<span .../>` references turned into
 * clickable chips — same rendering as the old per-trace run notes, but sourced
 * from a standalone text block. The referenced span's trace is resolved
 * session-wide from loaded spans (a text block isn't tied to one trace); a chip
 * whose span isn't loaded yet renders plain and upgrades once it loads.
 */
export default function NoteContent({ content }: { content: string }) {
  const setSelectedSpan = useSessionViewBaseStore((s) => s.setSelectedSpan);
  const getSpanType = useDebuggerSessionViewStore((s) => s.getSpanType);
  const findTraceIdForSpan = useDebuggerSessionViewStore((s) => s.findTraceIdForSpan);
  // Subscribe to spans so chips re-resolve as traces load.
  const traceSpans = useDebuggerSessionViewStore((s) => s.traceSpans);

  const processed = useMemo(() => spanTagsToLinks(content), [content]);

  const components = useMemo<ComponentProps<typeof Response>["components"]>(
    () => ({
      ...noteMarkdownComponents,
      // `node` is react-markdown's AST node — drop it so it isn't spread onto the DOM <a>.
      a: ({ href, children, node: _node, ...rest }) => {
        let spanId: string | null = null;
        let referenceText: string | null = null;
        if (href) {
          try {
            const url = new URL(href);
            if (url.searchParams.get("lmnrSpanChip") === "1") {
              spanId = url.searchParams.get("spanId");
              referenceText = url.searchParams.get("referenceText");
            }
          } catch {
            // Not an absolute URL — fall through to a plain anchor.
          }
        }

        if (spanId) {
          const preview =
            referenceText && referenceText.length > REFERENCE_TEXT_PREVIEW_LEN
              ? `${referenceText.slice(0, REFERENCE_TEXT_PREVIEW_LEN)}…`
              : referenceText;
          const label = preview ? (
            <>
              {children} <span className="text-muted-foreground">({preview})</span>
            </>
          ) : (
            children
          );
          const id = spanId;
          const traceId = findTraceIdForSpan(id);
          if (traceId) {
            return (
              <SelfResolvingSpanChip
                label={label}
                traceId={traceId}
                spanId={id}
                spanType={getSpanType(traceId, id)}
                onClick={() => setSelectedSpan({ traceId, spanId: id })}
              />
            );
          }
          // Span not loaded yet — render the chip without resolution/opening.
          return <SpanChip label={label} spanType={undefined} onClick={() => {}} />;
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" {...rest}>
            {children}
          </a>
        );
      },
    }),
    // `traceSpans` in deps so the override re-resolves as spans stream in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getSpanType, findTraceIdForSpan, setSelectedSpan, traceSpans]
  );

  return (
    <Response className={cn(noteProseClassName)} components={components}>
      {processed}
    </Response>
  );
}
