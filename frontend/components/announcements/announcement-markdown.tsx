"use client";

import { type ComponentProps, createElement, type JSX, type ReactNode } from "react";

import { Response } from "@/components/ai-elements/response";
import { cn } from "@/lib/utils";

type Components = NonNullable<ComponentProps<typeof Response>["components"]>;
type ElProps = { node?: unknown; className?: string; children?: ReactNode } & Record<string, unknown>;

// Keep announcement articles visually aligned with debugger notes while
// allowing either surface to evolve independently.
const STYLES: Partial<Record<keyof JSX.IntrinsicElements, string>> = {
  h1: "mt-3 mb-1 text-xl font-semibold text-foreground scroll-mt-4",
  h2: "mt-3 mb-1 text-lg font-semibold text-foreground scroll-mt-4",
  h3: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  h4: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  h5: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  h6: "mt-2 mb-1 text-base font-semibold text-foreground scroll-mt-4",
  p: "my-1.5 text-sm leading-relaxed text-secondary-foreground",
  ul: "my-1.5 ml-1 list-disc pl-4 text-sm text-secondary-foreground [&>li+li]:mt-0.5",
  ol: "my-1.5 ml-1 list-decimal pl-4 text-sm text-secondary-foreground [&>li+li]:mt-0.5",
  li: "leading-relaxed",
  blockquote: "my-1.5 border-l-2 border-border pl-3 text-sm italic text-muted-foreground",
  hr: "my-3 border-border",
  table: "my-2 w-full border-collapse text-xs",
  th: "border border-border px-2 py-1 text-left font-medium",
  td: "border border-border px-2 py-1",
};

const CODE_BLOCK_CLASS =
  "my-2 block overflow-x-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-xs leading-relaxed text-foreground";
const CODE_BLOCK_CODE_CLASS = "font-mono";
const INLINE_CODE_CLASS = "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground";

const flattenText = (children: ReactNode): string =>
  typeof children === "string" ? children : Array.isArray(children) ? children.map(flattenText).join("") : "";

const components = {
  ...Object.fromEntries(
    Object.entries(STYLES).map(([tag, className]) => [
      tag,
      ({ node: _node, className: _incoming, ...props }: ElProps) =>
        createElement(tag, { className: cn(className), ...props }),
    ])
  ),
  pre: ({ node: _node, className: _className, children, ...props }: ElProps) => (
    <pre className={CODE_BLOCK_CLASS} {...props}>
      {children}
    </pre>
  ),
  code: ({ node: _node, className, children, ...props }: ElProps) => {
    const isBlock = /language-/.test(className ?? "") || flattenText(children).includes("\n");
    return (
      <code className={isBlock ? CODE_BLOCK_CODE_CLASS : INLINE_CODE_CLASS} {...props}>
        {children}
      </code>
    );
  },
} as Components;

const AnnouncementMarkdown = ({ children }: { children: string }) => (
  <Response className="text-sm text-secondary-foreground" components={components}>
    {children}
  </Response>
);

export default AnnouncementMarkdown;
