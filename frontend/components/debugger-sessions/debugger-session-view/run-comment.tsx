"use client";

import { type ComponentProps, useMemo } from "react";

import { Response } from "@/components/ai-elements/response";
import { cn } from "@/lib/utils";

import { buildHeadingComponents, noteMarkdownComponents, noteProseClassName, spanTagsToLinks } from "./note-markdown";
import { SpanChip } from "./span-reference";
import { useDebuggerSessionViewStore } from "./store";
import { useTmpVariantStore } from "./tmp-variant-store";

interface RunCommentProps {
  traceId: string;
}

const REFERENCE_TEXT_PREVIEW_LEN = 24;

/**
 * Agent-authored run note: sits under the run's index row and above the
 * timeline. There is no separate run title — the note owns its own heading. The
 * note (trace metadata `rollout.note`) is markdown, rendered via Streamdown.
 *
 * Span references are written by the agent as `<span id='<spanId>' name='..' />`
 * tags (see `spanTagsToLinks`); those become clickable span chips. Plain
 * markdown links render as ordinary anchors — the XML tag is the ONLY way to get
 * a chip. Renders nothing when the run has no note.
 */
export default function RunComment({ traceId }: RunCommentProps) {
  const comment = useDebuggerSessionViewStore((state) => state.traces.get(traceId)?.comment);
  const getSpanType = useDebuggerSessionViewStore((state) => state.getSpanType);
  const openSidePanel = useDebuggerSessionViewStore((state) => state.openSidePanel);
  // TODO: remove — temporary toggle to compare markdown vs raw note rendering.
  const renderAsMarkdown = useTmpVariantStore((s) => s.renderNotesAsMarkdown);

  // Rewrite `<span .../>` tags to marked links before markdown rendering.
  const processed = useMemo(() => (comment ? spanTagsToLinks(comment, traceId) : comment), [comment, traceId]);

  // Element styling comes from the editable `noteMarkdownComponents` config; we
  // add the `a` override here because it needs store callbacks. Memoised so
  // Streamdown's memo isn't busted every render.
  const components = useMemo<ComponentProps<typeof Response>["components"]>(
    () => ({
      ...noteMarkdownComponents,
      // Stamp anchor ids on headings so the session outline can scroll to them.
      ...buildHeadingComponents(traceId),
      // `node` is react-markdown's AST node — drop it so it isn't spread onto
      // the DOM <a> (React warns on unknown DOM props otherwise).
      a: ({ href, children, node: _node, ...rest }) => {
        // Only links minted from a `<span .../>` tag (carrying lmnrSpanChip=1)
        // become chips; every other link is a plain anchor.
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
              onClick={() => openSidePanel(traceId, id)}
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
    [getSpanType, openSidePanel, traceId]
  );

  if (!comment) return null;

  return (
    <div className="flex w-full items-start">
      {renderAsMarkdown ? (
        <Response className={cn("flex-1", noteProseClassName)} components={components}>
          {processed}
        </Response>
      ) : (
        // TODO: remove — raw view for comparison against the markdown renderer.
        <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-secondary-foreground">{comment}</p>
      )}
    </div>
  );
}
