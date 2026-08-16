"use client";

import { motion } from "framer-motion";
import { ArrowUp, Bolt, ChevronLeft, Maximize2, MessageCircle, Plus, X } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { parseSpanLinks } from "@/lib/traces/span-link-parsing";
import { cn } from "@/lib/utils";

interface MockMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// Trace f4a22e85… — opencode REST-client scaffold mock. Source of truth for
// span IDs in this mock conversation is the matching trace in laminar. Keep
// in sync with `understand-why-trace-view/index.tsx` TRACE_ID and the chip
// span IDs exported from `signal-event-card.tsx`.
const TRACE_ID = "f4a22e85-089a-0959-fd1e-3002e236e42f";
const PROJECT_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const spanLink = (label: string, spanId: string) =>
  `\`[${label}](https://lmnr.ai/project/${PROJECT_ID_PLACEHOLDER}/traces/${TRACE_ID}?spanId=${spanId})\``;

// Real span IDs inside trace f4a22e85-089a-0959-fd1e-3002e236e42f.
// PLAN_LLM is the LLM call whose tool_call output contained the bad
// `python` invocation — the planning span where the reasoning slipped.
const PLAN_LLM_SPAN = "00000000-0000-0000-5d0e-4970807b7819";
const PYTHON_NOT_FOUND_BASH_SPAN = "00000000-0000-0000-038c-8b88bf836ac3";
const PARALLEL_CANCEL_BASH_SPAN = "00000000-0000-0000-29df-c05ef26d7cd7";
const CWD_DRIFT_READ_SPAN = "00000000-0000-0000-0cc6-1af923a75a8e";

const INITIAL_RESPONSE = `#### The reasoning mistake
The agent's plan in this ${spanLink("ai.streamText.doStream", PLAN_LLM_SPAN)} said "run \`python auth.py\` to verify" — assuming \`python\` was on PATH. macOS hasn't shipped a bare \`python\` symlink for years; only \`python3\` exists. That one planning slip fanned into three ${spanLink("bash", PYTHON_NOT_FOUND_BASH_SPAN)} \`command not found\` retries before the agent caught on.

The remaining two issues — a parallel-call ${spanLink("bash", PARALLEL_CANCEL_BASH_SPAN)} cascade cancel and a CWD-drift ${spanLink("read", CWD_DRIFT_READ_SPAN)} miss — are independent missteps but in the same class: unstated environment assumptions the agent's plan never sanity-checked.

#### Prevention
Three one-line system-prompt guardrails would close all four:
- "Use \`python3\`, not \`python\`."
- "Don't issue parallel Bash calls that depend on each other."
- "After any \`cd\`, prefer absolute paths in subsequent commands."

The first alone removes the three retries plus the cascade-cancel.`;

const INITIAL_MESSAGES: MockMessage[] = [
  {
    id: "init-user",
    role: "user",
    // Newcomer-perspective: a fresh-eyes ask that frames the LLM span
    // as the *root cause* (the agent's plan was wrong) and naturally
    // leads into the prevention strategy.
    text: "What was the agent thinking when it made these mistakes, and how do I prevent them?",
  },
  { id: "init-assistant", role: "assistant", text: INITIAL_RESPONSE },
];

const MOCK_RESPONSE = "Log in to chat with your traces";

// Each known span label gets mapped to its tool/llm classification so the
// chip can pick the right icon + color. Unknown labels fall through to
// "tool" (Bolt). FLAG: if INITIAL_RESPONSE references a new span name,
// add it here or it will render as a generic tool chip.
const LABEL_TO_KIND: Record<string, "tool" | "llm"> = {
  read: "tool",
  edit: "tool",
  bash: "tool",
  "ai.streamText.doStream": "llm",
};

const KIND_CONFIG = {
  tool: { iconBg: "bg-tool", icon: <Bolt className="size-3 text-white" strokeWidth={2} /> },
  llm: { iconBg: "bg-llm", icon: <MessageCircle className="size-3 text-white" strokeWidth={2} /> },
} as const;

// Chip styled to match the SignalEventCard span chips: small icon swatch
// on the left, label on the right, neutral pill background. Clickable —
// drills the trace-view store to the referenced span.
const SpanChip = ({ kind, label, onClick }: { kind: "tool" | "llm"; label: string; onClick: () => void }) => {
  const { iconBg, icon } = KIND_CONFIG[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-foreground-200/15 bg-foreground-200/15 pl-0.5 pr-1.5 py-0.5 align-middle hover:bg-foreground-200/25 transition-colors"
    >
      <span className={cn("inline-flex items-center justify-center size-4 rounded", iconBg)}>{icon}</span>
      <span className="text-foreground-200 text-xs leading-none font-mono">{label}</span>
    </button>
  );
};

// Render the code-element children as a sequence of SpanChips interleaved
// with leftover text. Uses the shared parseSpanLinks finder (the same one
// chat.tsx relies on) so we don't depend on the children being exactly
// the link string — Streamdown's parseIncompleteMarkdown can wrap the
// children with whitespace mid-stream and the anchored regex we used
// before would silently miss every chip.
const renderSpanChips = (text: string, onSelect: (spanId: string) => void): ReactNode | null => {
  const matches = parseSpanLinks(text).filter((m) => m.spanId);
  if (matches.length === 0) return null;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  matches.forEach((m, i) => {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    const kind = LABEL_TO_KIND[m.label] ?? "tool";
    parts.push(<SpanChip key={`chip-${i}`} kind={kind} label={m.label} onClick={() => onSelect(m.spanId!)} />);
    lastIndex = m.index + m.length;
  });
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <Fragment>{parts}</Fragment>;
};

// Word-by-word streaming reveal of the initial assistant response. Tokens
// are whitespace-delimited; backtick-wrapped span links are guaranteed
// single tokens (no internal whitespace in the URLs), so we never render a
// half-broken chip mid-stream.
const STREAM_INTERVAL_MS = 30;

// Context breadcrumb above the input. Classes are copied verbatim from the
// product's ContextBadge; the real one makes each segment click-to-copy, which
// is pointless on a landing page, so these are plain divs.
// The product's wrapper also carries `bg-landing-surface-800` — an undefined
// utility that paints nothing — so it is deliberately not carried over. The
// `-mb-5` / `pb-6.5` pair is what tucks this row behind the input above it.
const ContextRow = ({ traceName, spanName }: { traceName?: string | null; spanName?: string }) => {
  const segments = [
    { label: "Trace", name: traceName?.trim() },
    ...(spanName?.trim() ? [{ label: "Span", name: spanName.trim() }] : []),
  ];

  return (
    <div className="relative z-0 -mb-5 w-full">
      <div className="flex items-center gap-1.5 w-full rounded-t-xl px-2 pt-1.5 pb-6.5 text-xs">
        {segments.map((segment, i) => (
          <Fragment key={segment.label}>
            {i > 0 && <span className="shrink-0 text-foreground-500">/</span>}
            <div className="flex min-w-0 items-center gap-1 rounded-full border border-surface-200 bg-secondary px-2 py-0.5 text-foreground-400">
              <span className="shrink-0 font-medium">{segment.label}</span>
              {segment.name && <span className="truncate font-medium text-foreground/90">{segment.name}</span>}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};

// Name the auto-namer would land on for the conversation mocked below.
const CHAT_NAME = "Agent's reasoning mistakes";

// Replica of the agent panel's chat-pane header: history chevron, chat name,
// then new chat / full screen / close. Every button is decorative
// (disabled + disabled:opacity-100), and the title is a plain span rather than
// the product's ghost input — there is nothing to rename here.
const ChatHeader = () => (
  <div className="flex items-center justify-between gap-2 px-2 py-2 flex-shrink-0 relative z-10">
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Button
        variant="ghost"
        disabled
        aria-label="Chat history"
        className="px-0.5 h-6 w-6 shrink-0 disabled:opacity-100"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="truncate px-1 text-sm font-medium">{CHAT_NAME}</span>
    </div>
    <div className="flex items-center gap-0.5 shrink-0">
      {[
        { Icon: Plus, label: "New chat" },
        { Icon: Maximize2, label: "Open full screen" },
        { Icon: X, label: "Close" },
      ].map(({ Icon, label }) => (
        <Button key={label} variant="ghost" disabled aria-label={label} className="px-0.5 h-6 w-6 disabled:opacity-100">
          <Icon className="w-4 h-4" />
        </Button>
      ))}
    </div>
    {/* Fades the conversation out under the header as it scrolls. */}
    <div className="w-full h-[28px] bg-gradient-to-b from-background to-transparent top-full left-0 absolute z-20 pointer-events-none" />
  </div>
);

export default function AskAi() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);

  const selectSpanById = useTraceViewBaseStore((state) => state.selectSpanById);
  // Primitive selectors, so no shallow comparator is needed.
  const traceName = useTraceViewBaseStore((state) => state.trace?.topSpanName);
  const selectedSpanName = useTraceViewBaseStore((state) => state.selectedSpan?.name);

  // Split keeping whitespace runs as separate tokens (capture group), so
  // `\n\n` paragraph breaks survive the reveal — otherwise the streamed
  // text becomes one long line and `## Failures` swallows everything as
  // an H2.
  const tokens = useMemo(() => INITIAL_RESPONSE.split(/(\s+)/), []);
  const wordEndIndices = useMemo(
    () => tokens.reduce<number[]>((acc, t, i) => (/\S/.test(t) ? [...acc, i] : acc), []),
    [tokens]
  );
  const [streamedCount, setStreamedCount] = useState(0);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setStreamedCount(n);
      if (n >= wordEndIndices.length) clearInterval(id);
    }, STREAM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [wordEndIndices.length]);
  const streamedAssistantText = useMemo(() => {
    if (streamedCount === 0) return "";
    const endIdx = wordEndIndices[Math.min(streamedCount, wordEndIndices.length) - 1];
    return tokens.slice(0, endIdx + 1).join("");
  }, [tokens, wordEndIndices, streamedCount]);

  const components = useMemo<{ code: (props: { children?: ReactNode }) => ReactNode }>(
    () => ({
      code: ({ children }) => {
        const text = String(children);
        const chips = renderSpanChips(text, selectSpanById);
        if (chips) return chips;
        return <span className="text-xs bg-secondary rounded text-white font-mono px-1.5 py-0.5">{children}</span>;
      },
    }),
    [selectSpanById]
  );

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    const ts = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: `u-${ts}`, role: "user", text: trimmed },
      { id: `a-${ts}`, role: "assistant", text: MOCK_RESPONSE },
    ]);
  };

  const renderText = (m: MockMessage) => (m.id === "init-assistant" ? streamedAssistantText : m.text);

  return (
    <div className="flex flex-col overflow-hidden relative h-full">
      <ChatHeader />
      <Conversation className="relative">
        <ConversationContent className="space-y-4 py-4 px-0 pb-12">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "px-3" : "px-5")}>
              <div
                className={cn("w-full", m.role === "user" ? "bg-muted/50 rounded px-2 py-1 border" : "bg-background")}
              >
                <div className="text-sm text-foreground leading-relaxed space-y-2">
                  <Response components={components}>{renderText(m)}</Response>
                </div>
              </div>
            </div>
          ))}
        </ConversationContent>
      </Conversation>

      <div className="flex-none px-3 pb-2 bg-transparent">
        <div className="flex flex-col">
          <ContextRow traceName={traceName} spanName={selectedSpanName} />
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="relative z-20 rounded-xl border border-border/40 bg-card transition-colors focus-within:border-border/60"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex flex-col p-2"
            >
              <DefaultTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Summarize, debug, and more"
                className="bg-transparent border-none focus:outline-hidden focus-visible:ring-0 resize-none w-full px-1.5 pt-0.5 text-sm leading-relaxed placeholder:text-muted-foreground/60 minimal-scrollbar"
                minRows={1}
                maxRows={8}
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="submit"
                  size="icon"
                  className="h-7 w-7 rounded-full flex-shrink-0 transition-transform hover:scale-105 active:scale-95 disabled:scale-100"
                  disabled={input.trim() === ""}
                  aria-label="Send message"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
        <span className="block text-xs text-muted-foreground/50 text-center pt-1.5">
          Laminar Agent is in <span className="underline">beta</span> and can make mistakes.
        </span>
      </div>
    </div>
  );
}
