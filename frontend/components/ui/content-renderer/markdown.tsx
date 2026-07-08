import { memo } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { cn, tryParseJson } from "@/lib/utils";

// Unwrap JSON-stringified span payloads (`"# Hello"`) to the inner markdown source.
export const getMarkdownSource = (value: string): string => {
  const parsed = tryParseJson(value);
  return typeof parsed === "string" ? parsed : value;
};

interface MarkdownRendererProps {
  value: string;
  className?: string;
}

const PureMarkdownRenderer = ({ value, className }: MarkdownRendererProps) => (
  <div className={cn("w-full text-[13px]", className)}>
    <Streamdown
      mode="static"
      parseIncompleteMarkdown={false}
      isAnimating={false}
      className="text-wrap [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      rehypePlugins={[defaultRehypePlugins.harden]}
      components={{
        h1: ({ children, className, ...props }) => (
          <h1 {...props} className={cn(className, "mt-3 mb-1 text-base font-semibold")}>
            {children}
          </h1>
        ),
        h2: ({ children, className, ...props }) => (
          <h2 {...props} className={cn(className, "mt-3 mb-1 text-sm font-semibold")}>
            {children}
          </h2>
        ),
        h3: ({ children, className, ...props }) => (
          <h3 {...props} className={cn(className, "mt-2 mb-1 text-sm font-semibold")}>
            {children}
          </h3>
        ),
        p: ({ children, className, ...props }) => (
          <p {...props} className={cn(className, "my-1.5 text-[13px] leading-relaxed")}>
            {children}
          </p>
        ),
        ul: ({ children, className, ...props }) => (
          <ul {...props} className={cn(className, "my-1.5 list-disc pl-5 text-[13px] space-y-0.5")}>
            {children}
          </ul>
        ),
        ol: ({ children, className, ...props }) => (
          <ol {...props} className={cn(className, "my-1.5 list-decimal pl-5 text-[13px] space-y-0.5")}>
            {children}
          </ol>
        ),
        li: ({ children, className, ...props }) => (
          <li {...props} className={cn(className, "text-[13px] leading-relaxed")}>
            {children}
          </li>
        ),
        blockquote: ({ children, className, ...props }) => (
          <blockquote
            {...props}
            className={cn(className, "my-1.5 border-l-2 border-border pl-3 text-[13px] italic text-muted-foreground")}
          >
            {children}
          </blockquote>
        ),
        code: ({ children, className, ...props }) => (
          <code {...props} className={cn(className, "text-xs font-mono whitespace-pre-wrap")}>
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
