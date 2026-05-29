"use client";

import { ArrowUp, Bolt, MessageCircle } from "lucide-react";
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
      className="inline-flex items-center gap-1 rounded border border-landing-text-200/15 bg-landing-text-200/15 pl-0.5 pr-1.5 py-0.5 align-middle hover:bg-landing-text-200/25 transition-colors"
    >
      <span className={cn("inline-flex items-center justify-center size-4 rounded", iconBg)}>{icon}</span>
      <span className="text-landing-text-200 text-xs leading-none font-mono">{label}</span>
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

export default function AskAi() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);

  const selectSpanById = useTraceViewBaseStore((state) => state.selectSpanById);

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
      <div className="flex items-center justify-between px-2 pt-2 pb-2 flex-shrink-0 relative">
        <span className="text-base font-medium ml-2">Chat with trace</span>
        <div className="w-full h-[28px] bg-gradient-to-b from-background to-transparent top-full left-0 absolute z-20 pointer-events-none" />
      </div>
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
        <div className="border rounded-lg bg-muted/40">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <div className="flex flex-row items-end w-full py-1">
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
                className="bg-transparent border-none focus-visible:ring-0 resize-none flex-1 min-w-0"
                rows={1}
                maxRows={6}
              />
              <Button
                type="submit"
                size="icon"
                className="h-7 w-7 rounded-full border bg-primary flex-shrink-0 mr-1 mb-1"
                variant="ghost"
                disabled={input.trim() === ""}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
      <span className="text-xs text-muted-foreground/50 text-center pb-2">Trace agent can make mistakes.</span>
    </div>
  );
}
