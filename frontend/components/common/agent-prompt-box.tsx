"use client";

import { Check, Copy } from "lucide-react";
import {
  type ComponentProps,
  createElement,
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

type Components = NonNullable<ComponentProps<typeof Streamdown>["components"]>;

// Streamdown ships big defaults (h1 `text-3xl`, headings with `mt-6 mb-2`),
// too large for this inline prompt box. The classes below replace those per
// element.
const STYLES: Partial<Record<keyof JSX.IntrinsicElements, string>> = {
  h1: "mt-3 mb-1 text-xl font-semibold text-muted-foreground",
  h2: "mt-3 mb-1 text-lg font-semibold text-muted-foreground",
  h3: "mt-2 mb-1 text-base font-semibold text-muted-foreground",
  h4: "mt-2 mb-1 text-base font-semibold text-muted-foreground",
  h5: "mt-2 mb-1 text-base font-semibold text-muted-foreground",
  h6: "mt-2 mb-1 text-base font-semibold text-muted-foreground",
  p: "my-1.5 text-sm leading-relaxed text-muted-foreground",
  ul: "my-1.5 ml-1 list-disc space-y-0.5 pl-4 text-sm text-muted-foreground",
  ol: "my-1.5 ml-1 list-decimal space-y-0.5 pl-4 text-sm text-muted-foreground",
  li: "leading-relaxed text-muted-foreground my-2",
  blockquote: "my-1.5 border-l-2 border-border pl-3 text-sm italic text-muted-foreground text-muted-foreground",
  hr: "my-3 border-border text-muted-foreground",
  a: "text-secondary-foreground",
};

const INLINE_CODE_CLASS = "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground";

type ElProps = { node?: unknown; className?: string; children?: ReactNode } & Record<string, unknown>;

const markdownComponents = {
  // Build simple-tag overrides from STYLES. `node` is react-markdown's AST
  // node — drop it so it isn't spread onto the DOM element (React warns).
  ...Object.fromEntries(
    Object.entries(STYLES).map(([tag, className]) => [
      tag,
      ({ node: _node, className: _incoming, ...props }: ElProps) =>
        createElement(tag, { className: cn(className), ...props }),
    ])
  ),
  code: ({ node: _node, className: _c, children, ...props }: ElProps) => (
    <code className={INLINE_CODE_CLASS} {...props}>
      {children}
    </code>
  ),
} as Components;

const proseClassName = "text-sm text-secondary-foreground";

interface AgentPromptBoxProps {
  prompt: string;
  copyLabel?: string;
  onCopy?: () => void;
}

// Scrollable, click-to-copy box that renders an agent prompt as markdown.
export function AgentPromptBox({ prompt, copyLabel = "Copy setup prompt", onCopy }: AgentPromptBoxProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [notAtTheBottom, setNotAtTheBottom] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setNotAtTheBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [updateScrollState]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently no-op.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="relative flex flex-col rounded-md border bg-secondary text-left text-base text-muted-foreground group hover:border-secondary-foreground/25 active:border-secondary-foreground/35 overflow-hidden"
    >
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="max-h-[220px] overflow-y-auto px-5 py-4 transition-all duration-200"
      >
        <Streamdown className={proseClassName} components={markdownComponents}>
          {prompt}
        </Streamdown>
      </div>
      {notAtTheBottom && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[120px] bg-gradient-to-t from-secondary to-transparent" />
      )}
      <div
        aria-label={copied ? "Copied" : "Copy prompt"}
        className="absolute top-2 right-2 items-center gap-2 rounded bg-primary px-3 py-1 text-sm transition-colors flex border border-white/20 text-primary-foreground"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? <span>Copied</span> : <span>{copyLabel}</span>}
      </div>
    </button>
  );
}

export default AgentPromptBox;
