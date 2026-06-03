"use client";

import { type ComponentProps, useMemo } from "react";

import { Response } from "@/components/ai-elements/response";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { cn } from "@/lib/utils";

import { buildHeadingComponents, noteMarkdownComponents, noteProseClassName, spanTagsToLinks } from "./note-markdown";
import { SpanChip } from "./span-reference";
import { useDebuggerSessionViewStore } from "./store";

interface RunCommentProps {
  traceId: string;
}

const REFERENCE_TEXT_PREVIEW_LEN = 24;

/**
 * Agent-authored run note (debugger context): markdown rendered above its run's
 * body. The note (trace metadata `rollout.note`) owns its own heading; there is
 * no separate run title. Span references are `<span id='..' name='..' />` tags
 * (see `spanTagsToLinks`) which become clickable chips that open the span panel.
 * Renders nothing when the run has no note.
 */
export default function RunComment({ traceId }: RunCommentProps) {
  const comment = useDebuggerSessionViewStore((state) => state.noteForTrace(traceId));
  const getSpanType = useDebuggerSessionViewStore((state) => state.getSpanType);
  // Open the span via the shared session-view selection model (opens the span panel).
  const setSelectedSpan = useSessionViewBaseStore((s) => s.setSelectedSpan);

  // Rewrite `<span .../>` tags to marked links before markdown rendering.
  const processed = useMemo(() => (comment ? spanTagsToLinks(comment, traceId) : comment), [comment, traceId]);

  // Element styling comes from `noteMarkdownComponents`; the `a` override needs
  // store callbacks so it's built here. Memoised so Streamdown's memo isn't busted.
  const components = useMemo<ComponentProps<typeof Response>["components"]>(
    () => ({
      ...noteMarkdownComponents,
      // Stamp anchor ids on headings so the session outline can scroll to them.
      ...buildHeadingComponents(traceId),
      // `node` is react-markdown's AST node — drop it so it isn't spread onto the DOM <a>.
      a: ({ href, children, node: _node, ...rest }) => {
        // Only links minted from a `<span .../>` tag (carrying lmnrSpanChip=1) become chips.
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
          const id = spanId;
          return (
            <SpanChip
              label={
                preview ? (
                  <>
                    {children} <span className="text-muted-foreground">({preview})</span>
                  </>
                ) : (
                  children
                )
              }
              spanType={getSpanType(traceId, id)}
              onClick={() => setSelectedSpan({ traceId, spanId: id })}
            />
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" {...rest}>
            {children}
          </a>
        );
      },
    }),
    [getSpanType, setSelectedSpan, traceId]
  );

  if (!comment) return null;

  return (
    <div className="flex w-full items-start">
      <Response className={cn("flex-1", noteProseClassName)} components={components}>
        {processed}
      </Response>
    </div>
  );
}
