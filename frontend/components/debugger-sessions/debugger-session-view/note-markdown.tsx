"use client";

import { type ComponentProps, createElement, isValidElement, type JSX, type ReactNode } from "react";

import { type Response } from "@/components/ai-elements/response";
import { cn } from "@/lib/utils";

import { headingAnchorId, slugify } from "./session-outline/utils";

type Components = NonNullable<ComponentProps<typeof Response>["components"]>;

/**
 * EDIT HERE to tune how run notes look. Streamdown ships big defaults (h1
 * `text-3xl`, h2 `text-2xl`, headings with `mt-6 mb-2`), which is too large for
 * these inline notes. The classes below replace those per element — change a
 * value to resize/respace that element. Code blocks are handled separately
 * below (we replace Streamdown's heavy CodeBlock entirely).
 */
const STYLES: Partial<Record<keyof JSX.IntrinsicElements, string>> = {
  // Heading scale: h1 20px / h2 18px / h3+ 16px, stepping down to the 14px body.
  h1: "mt-3 mb-1 text-xl font-semibold text-foreground",
  h2: "mt-3 mb-1 text-lg font-semibold text-foreground",
  h3: "mt-2 mb-1 text-base font-semibold text-foreground",
  h4: "mt-2 mb-1 text-base font-semibold text-foreground",
  h5: "mt-2 mb-1 text-base font-semibold text-foreground",
  h6: "mt-2 mb-1 text-base font-semibold text-foreground",
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

// EDIT HERE for the code block. We replace Streamdown's CodeBlock (the ugly
// header bar + copy button + shiki highlighting) with a plain, small block.
// `pre` is the container; block/inline `code` get their own classes.
const CODE_BLOCK_CLASS =
  "my-2 block overflow-x-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-xs leading-relaxed text-foreground";
const CODE_BLOCK_CODE_CLASS = "font-mono"; // inside <pre> — container owns the box
const INLINE_CODE_CLASS = "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground";

type ElProps = { node?: unknown; className?: string; children?: ReactNode } & Record<string, unknown>;

const flattenText = (children: ReactNode): string =>
  typeof children === "string" ? children : Array.isArray(children) ? children.map(flattenText).join("") : "";

const components = {
  // Build the simple-tag overrides from STYLES. `node` is react-markdown's AST
  // node — drop it so it isn't spread onto the DOM element (React warns).
  ...Object.fromEntries(
    Object.entries(STYLES).map(([tag, className]) => [
      tag,
      ({ node: _node, className: _incoming, ...props }: ElProps) =>
        createElement(tag, { className: cn(className), ...props }),
    ])
  ),
  pre: ({ node: _node, className: _c, children, ...props }: ElProps) => (
    <pre className={CODE_BLOCK_CLASS} {...props}>
      {children}
    </pre>
  ),
  code: ({ node: _node, className, children, ...props }: ElProps) => {
    // Fenced blocks carry a `language-*` class; multi-line content is also a
    // block. Everything else is inline code.
    const isBlock = /language-/.test(className ?? "") || flattenText(children).includes("\n");
    return (
      <code className={isBlock ? CODE_BLOCK_CODE_CLASS : INLINE_CODE_CLASS} {...props}>
        {children}
      </code>
    );
  },
} as Components;

/** Per-element overrides for run-note markdown. Merge an `a` override on top. */
export const noteMarkdownComponents: Components = components;

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/**
 * Heading overrides that stamp each rendered heading with the same anchor id the
 * session outline derives (`headingAnchorId(traceId, sourceLine)`), so clicking
 * an outline row scrolls to it. The id is keyed on react-markdown's source-line
 * position, which is order- and text-collision-proof. Merge these on top of
 * `noteMarkdownComponents` (they reuse the same STYLES, plus an id + scroll
 * offset). Trace-scoped, so build them per RunComment.
 */
// Recursively pull the visible text out of a heading's children (recurses into
// elements like <strong>/<em>/<code> so inline markdown still contributes).
const nodeText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
};

export const buildHeadingComponents = (traceId: string): Components =>
  Object.fromEntries(
    HEADING_TAGS.map((tag) => [
      tag,
      ({ node: _node, className: _incoming, ...props }: ElProps) => {
        // Stamp the id here, in the React override — this runs AFTER Streamdown's
        // rehype-sanitize, which strips/clobbers ids added in the rehype pipeline
        // (rehype-slug). Derived from the heading text so it matches the outline.
        const slug = slugify(nodeText(props.children));
        return createElement(tag, {
          ...props,
          id: slug ? headingAnchorId(traceId, slug) : undefined,
          className: cn("scroll-mt-4", STYLES[tag]),
        });
      },
    ])
  ) as Components;

/** Container className for the note's markdown — just the base body size now. */
export const noteProseClassName = "text-sm text-secondary-foreground";

// Span references in notes use an XML tag the agent writes:
//   <span id='<spanId>' name='<label>' />
//   <span id='<spanId>' name='<label>' reference_text='<quote>' />
// `id` is the span UUID (from SQL). It's the ONLY way to produce a chip — plain
// markdown links render as ordinary anchors. We rewrite each tag to a marked
// markdown link (the proven Streamdown `a`-override chip path); RunComment's `a`
// renderer turns links carrying `lmnrSpanChip=1` into chips and leaves the rest
// as anchors. Query values are URL-encoded so the link survives markdown syntax.
// Attributes accept single OR double quotes (backreference-matched), and the
// lazy values backtrack past internal quotes of the same kind when the tag
// still closes (`name='Bob's tool'` parses; the previous `[^']*` couldn't).
// Agents writing quote-heavy text can switch that attribute's delimiters.
const SPAN_TAG_RE =
  /<span\s+id=(['"])([^'"]+)\1\s+name=(['"])([\s\S]*?)\3(?:\s+reference_text=(['"])([\s\S]*?)\5)?\s*\/>/g;

export function spanTagsToLinks(note: string, traceId: string): string {
  return note.replace(SPAN_TAG_RE, (_match, _q1, id: string, _q2, name: string, _q3, referenceText?: string) => {
    // Markdown link labels can't contain unescaped brackets; span names rarely do.
    const label = name.replace(/[[\]]/g, " ").trim() || "span";
    const params = new URLSearchParams({ spanId: id, lmnrSpanChip: "1" });
    if (referenceText) params.set("referenceText", referenceText);
    return `[${label}](https://lmnr.ai/project/-/traces/${traceId}?${params.toString()})`;
  });
}
