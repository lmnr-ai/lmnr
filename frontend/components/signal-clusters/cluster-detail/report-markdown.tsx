"use client";

import { type ReactNode, useMemo } from "react";

import { Response } from "@/components/ai-elements/response";
import { MarkdownSpanBadge, type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";

const TRACE_HREF = /\/traces\/([0-9a-f-]{36})/;

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

interface Props {
  children: string;
  onOpenTrace: (traceId: string) => void;
}

/** Report Markdown, with trace links rendered as the same chips the Laminar agent uses. */
export default function ReportMarkdown({ children, onOpenTrace }: Props) {
  const components = useMemo(() => {
    const callbacks: SpanReferenceCallbacks = {
      resolveSpanId: async () => null,
      getSpanType: () => undefined,
      onSelectSpan: ({ traceId }) => traceId && onOpenTrace(traceId),
    };
    return {
      a: ({ href, children: label }: { href?: string; children?: ReactNode }) => {
        const traceId = href?.match(TRACE_HREF)?.[1];
        if (!traceId) return <a href={href}>{label}</a>;
        return <MarkdownSpanBadge label={textOf(label)} traceId={traceId} callbacks={callbacks} />;
      },
    };
  }, [onOpenTrace]);

  return (
    <div className="text-sm [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_td_[data-slot=span-chip]]:max-w-56">
      <Response isAnimating={false} controls={{ table: false }} components={components}>
        {children}
      </Response>
    </div>
  );
}
