import { isNil } from "lodash";
import { useMemo } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { MarkdownSpanBadge, type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { parseSpanLinks } from "@/lib/traces/span-link-parsing";
import { cn } from "@/lib/utils.ts";

const formatOutput = (output: any): string => {
  if (typeof output === "string") return output;
  if (isNil(output)) return "";
  return JSON.stringify(output);
};

interface MarkdownProps {
  output: any;
  className?: string;
  contentClassName?: string;
  spanRefCallbacks?: SpanReferenceCallbacks;
}

const Markdown = ({ output, className, contentClassName, spanRefCallbacks }: MarkdownProps) => {
  const formattedOutput = useMemo(() => {
    if (!output) return "";
    return formatOutput(output);
  }, [output]);

  return (
    <div className={cn("text-white/60 [&_*]:text-inherit", className)}>
      <div className={cn("pb-2", contentClassName)}>
        <Streamdown
          mode="static"
          parseIncompleteMarkdown={false}
          isAnimating={false}
          className="rounded text-wrap"
          rehypePlugins={[defaultRehypePlugins.harden]}
          components={{
            h1: ({ children, className, ...props }) => (
              <h1 {...props} className={cn(className, "text-base")}>
                {children}
              </h1>
            ),
            p: ({ children, className, ...props }) => (
              <p {...props} className={cn(className, "text-[13px]")}>
                {children}
              </p>
            ),
            li: ({ children, className, ...props }) => (
              <li {...props} className={cn(className, "text-[13px]")}>
                {children}
              </li>
            ),
            ul: ({ children, className, ...props }) => (
              <ul {...props} className={cn(className, "text-[13px] list-disc pl-6")}>
                {children}
              </ul>
            ),
            ol: ({ children, className, ...props }) => (
              <ol {...props} className={cn(className, "text-[13px] list-decimal pl-6")}>
                {children}
              </ol>
            ),
            code: ({ children, className, ...props }) => (
              <code {...props} className={cn(className, "text-[13px] font-mono whitespace-pre-wrap")}>
                {children}
              </code>
            ),
            a: ({ href, children, ...props }) => {
              if (spanRefCallbacks && href) {
                // Reuse the markdown-link parser by re-wrapping the bare href.
                const [link] = parseSpanLinks(`[x](${href})`);
                if (link) {
                  return (
                    <MarkdownSpanBadge
                      label={typeof children === "string" ? children : link.label}
                      traceId={link.traceId}
                      spanUuid={link.spanId}
                      callbacks={spanRefCallbacks}
                    />
                  );
                }
              }
              return (
                <a {...props} href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {formattedOutput}
        </Streamdown>
      </div>
    </div>
  );
};

export default Markdown;
