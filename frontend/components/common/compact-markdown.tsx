"use client";

import { type ComponentProps, createElement, type JSX, type ReactNode } from "react";

import { type Response } from "@/components/ai-elements/response";
import { cn } from "@/lib/utils";

export type MarkdownComponents = NonNullable<ComponentProps<typeof Response>["components"]>;

export interface CompactMarkdownStyles {
  /** Per-tag classes that replace Streamdown's large defaults (h1 `text-3xl`, etc.). */
  elements: Partial<Record<keyof JSX.IntrinsicElements, string>>;
  /** Fenced/multi-line code container (`pre`). */
  codeBlock: string;
  inlineCode: string;
}

type ElProps = { node?: unknown; className?: string; children?: ReactNode } & Record<string, unknown>;

const flattenText = (children: ReactNode): string =>
  typeof children === "string" ? children : Array.isArray(children) ? children.map(flattenText).join("") : "";

/**
 * Streamdown component overrides for compact inline markdown: per-element sizes,
 * and a plain small code block in place of Streamdown's CodeBlock (header bar,
 * copy/download buttons, line numbers, shiki).
 */
export function createCompactMarkdownComponents({
  elements,
  codeBlock,
  inlineCode,
}: CompactMarkdownStyles): MarkdownComponents {
  return {
    // `node` is react-markdown's AST node — drop it so it isn't spread onto the DOM.
    ...Object.fromEntries(
      Object.entries(elements).map(([tag, className]) => [
        tag,
        ({ node: _node, className: _incoming, ...props }: ElProps) =>
          createElement(tag, { className: cn(className), ...props }),
      ])
    ),
    pre: ({ node: _node, className: _c, children, ...props }: ElProps) => (
      <pre className={codeBlock} {...props}>
        {children}
      </pre>
    ),
    code: ({ node: _node, className, children, ...props }: ElProps) => {
      // Fenced blocks carry a `language-*` class; multi-line content is also a block.
      const isBlock = /language-/.test(className ?? "") || flattenText(children).includes("\n");
      return (
        <code className={isBlock ? "font-mono" : inlineCode} {...props}>
          {children}
        </code>
      );
    },
  } as MarkdownComponents;
}
