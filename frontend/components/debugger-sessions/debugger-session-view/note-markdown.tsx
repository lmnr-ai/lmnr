"use client";

import { type JSX } from "react";

import { createCompactMarkdownComponents, type MarkdownComponents } from "@/components/common/compact-markdown";

/**
 * EDIT HERE to tune how run notes look. Streamdown ships big defaults (h1
 * `text-3xl`, h2 `text-2xl`, headings with `mt-6 mb-2`), which is too large for
 * these inline notes. The classes below replace those per element — change a
 * value to resize/respace that element. Code blocks replace Streamdown's heavy
 * CodeBlock entirely (see CODE_BLOCK_CLASS).
 */
const STYLES: Partial<Record<keyof JSX.IntrinsicElements, string>> = {
  // Heading scale: h1 20px / h2 18px / h3+ 16px, stepping down to the 14px body.
  h1: "mt-3 mb-1 text-xl font-semibold text-foreground scroll-mt-4",
  h2: "mt-3 mb-1 text-lg font-semibold text-foreground scroll-mt-4",
  h3: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  h4: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  h5: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  h6: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  p: "my-1.5 text-sm leading-relaxed text-secondary-foreground",
  ul: "my-1.5 ml-1 list-disc space-y-0.5 pl-4 text-sm text-secondary-foreground",
  ol: "my-1.5 ml-1 list-decimal space-y-0.5 pl-4 text-sm text-secondary-foreground",
  li: "leading-relaxed",
  blockquote: "my-1.5 border-l-2 border-border pl-3 text-sm italic text-muted-foreground",
  hr: "my-3 border-border",
  table: "my-2 w-full border-collapse text-xs",
  th: "border border-border px-2 py-1 text-left font-medium",
  td: "border border-border px-2 py-1",
};

// EDIT HERE for the code block (`pre` container) and inline code.
const CODE_BLOCK_CLASS =
  "my-2 block overflow-x-auto rounded-md border border-border bg-emphasis-1 p-2.5 font-mono text-xs leading-relaxed text-foreground";
const INLINE_CODE_CLASS = "rounded bg-emphasis-2 px-1 py-0.5 font-mono text-[0.85em] text-foreground";

const components = createCompactMarkdownComponents({
  elements: STYLES,
  codeBlock: CODE_BLOCK_CLASS,
  inlineCode: INLINE_CODE_CLASS,
});

/** Per-element overrides for run-note markdown. Merge an `a` override on top. */
export const noteMarkdownComponents: MarkdownComponents = components;

/** Container className for the note's markdown — just the base body size now. */
export const noteProseClassName = "text-sm text-secondary-foreground";

// Span references in notes use an XML tag the agent writes:
//   <span id='<spanId>' name='<label>' />
//   <span id='<spanId>' name='<label>' reference_text='<quote>' />
// Rewritten to a marked markdown link (the Streamdown `a`-override chip path);
// NoteContent's `a` renderer turns links carrying `lmnrSpanChip=1` into chips.
// The trace is resolved session-wide at render time, so no traceId is embedded.
const SPAN_TAG_RE =
  /<span\s+id=(['"])([^'"]+)\1\s+name=(['"])([\s\S]*?)\3(?:\s+reference_text=(['"])([\s\S]*?)\5)?\s*\/>/g;

export function spanTagsToLinks(note: string): string {
  return note.replace(SPAN_TAG_RE, (_match, _q1, id: string, _q2, name: string, _q3, referenceText?: string) => {
    const label = name.replace(/[[\]]/g, " ").trim() || "span";
    const params = new URLSearchParams({ spanId: id, lmnrSpanChip: "1" });
    if (referenceText) params.set("referenceText", referenceText);
    return `[${label}](https://lmnr.ai/span?${params.toString()})`;
  });
}
