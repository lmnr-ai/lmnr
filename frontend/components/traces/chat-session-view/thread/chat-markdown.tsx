import { defaultRehypePlugins } from "streamdown";

import { Response } from "@/components/ai-elements/response";
import { createCompactMarkdownComponents } from "@/components/common/compact-markdown";
import { cn } from "@/lib/utils";

// Same compact approach as debugger run notes, on the chat's 12px scale:
// h1 14px / h2 13px / h3+ 12px semibold, 12px body, 11px code.
const components = createCompactMarkdownComponents({
  elements: {
    h1: "mt-3 mb-1 text-sm font-semibold text-foreground",
    h2: "mt-3 mb-1 text-[13px] font-semibold text-foreground",
    h3: "mt-2 mb-1 text-xs font-semibold text-foreground",
    h4: "mt-2 mb-1 text-xs font-semibold text-foreground",
    h5: "mt-2 mb-1 text-xs font-semibold text-foreground",
    h6: "mt-2 mb-1 text-xs font-semibold text-foreground",
    p: "my-1.5 text-xs leading-5 text-foreground",
    ul: "my-1.5 ml-1 list-disc space-y-0.5 pl-4 text-xs leading-5 text-foreground",
    ol: "my-1.5 ml-1 list-decimal space-y-0.5 pl-4 text-xs leading-5 text-foreground",
    li: "leading-5",
    blockquote: "my-1.5 border-l-2 border-border pl-3 text-xs italic text-muted-foreground",
    hr: "my-3 border-border",
    table: "my-2 w-full border-collapse text-[11px]",
    th: "border border-border px-2 py-1 text-left font-medium",
    td: "border border-border px-2 py-1 align-top",
  },
  codeBlock:
    "my-2 block max-h-80 overflow-auto rounded-md border border-border bg-emphasis-1 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground",
  inlineCode: "rounded bg-emphasis-2 px-1 py-0.5 font-mono text-[0.9em] text-foreground",
});

const rehypePlugins = [defaultRehypePlugins.raw, defaultRehypePlugins.sanitize, defaultRehypePlugins.harden];

export default function ChatMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <Response
      mode="static"
      parseIncompleteMarkdown={false}
      isAnimating={false}
      rehypePlugins={rehypePlugins}
      className={cn("text-xs text-foreground break-words", className)}
      components={components}
    >
      {text}
    </Response>
  );
}
