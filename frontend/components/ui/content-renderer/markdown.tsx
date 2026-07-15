import { memo, type Ref } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { cn, tryParseJson } from "@/lib/utils";

export const getMarkdownSource = (value: string): string => {
  const parsed = tryParseJson(value);
  return typeof parsed === "string" ? parsed : value;
};

interface MarkdownRendererProps {
  value: string;
  className?: string;
  containerRef?: Ref<HTMLDivElement>;
}

const PureMarkdownRenderer = ({ value, className, containerRef }: MarkdownRendererProps) => (
  <div
    ref={containerRef}
    className={cn("w-full min-w-0 text-[12px] text-card-foreground [font-family:monospace]", className)}
  >
    <Streamdown
      mode="static"
      parseIncompleteMarkdown={false}
      isAnimating={false}
      className={cn(
        "text-wrap [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-hidden [&_pre_code]:whitespace-pre-wrap text-xs"
      )}
      controls={{ mermaid: { download: false, fullscreen: false } }}
      rehypePlugins={[defaultRehypePlugins.harden]}
      components={{
        h1: ({ children, className, ...props }) => (
          <h1 {...props} className={cn(className, "mt-3 mb-1 text-base font-semibold")}>
            {children}
          </h1>
        ),
        h2: ({ children, className, ...props }) => (
          <h2 {...props} className={cn(className, "mt-3 mb-1 text-xs font-semibold")}>
            {children}
          </h2>
        ),
        td: ({ children, className, ...props }) => (
          <td {...props} className={cn(className, "text-xs px-2 py-1")}>
            {children}
          </td>
        ),
        th: ({ children, className, ...props }) => (
          <th {...props} className={cn(className, "whitespace-nowrap px-2 py-1 text-left font-semibold text-sm")}>
            {children}
          </th>
        ),
        h3: ({ children, className, ...props }) => (
          <h3 {...props} className={cn(className, "mt-2 mb-1 text-sm font-semibold")}>
            {children}
          </h3>
        ),
        p: ({ children, className, ...props }) => (
          <p {...props} className={cn(className, "my-1.5 text-xs leading-relaxed")}>
            {children}
          </p>
        ),
        sub: ({ children, className, ...props }) => (
          <sub {...props} className={cn(className, "text-xs")}>
            {children}
          </sub>
        ),
        ul: ({ children, className, ...props }) => (
          <ul {...props} className={cn(className, "my-1.5 list-disc pl-5 text-[12px] space-y-0.5")}>
            {children}
          </ul>
        ),
        ol: ({ children, className, ...props }) => (
          <ol {...props} className={cn(className, "my-1.5 list-decimal pl-5 text-[12px] space-y-0.5")}>
            {children}
          </ol>
        ),
        li: ({ children, className, ...props }) => (
          <li {...props} className={cn(className, "text-[12px] leading-relaxed")}>
            {children}
          </li>
        ),
        blockquote: ({ children, className, ...props }) => (
          <blockquote
            {...props}
            className={cn(className, "my-1.5 border-l-2 border-border pl-3 text-[12px] italic text-muted-foreground")}
          >
            {children}
          </blockquote>
        ),
        code: ({ children, className, ...props }) => (
          <code {...props} className={cn(className, "text-xs whitespace-pre-wrap")}>
            {children}
          </code>
        ),
        a: ({ href, children, ...props }) => (
          <a {...props} href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {value}
    </Streamdown>
  </div>
);

export const MarkdownRenderer = memo(PureMarkdownRenderer);
