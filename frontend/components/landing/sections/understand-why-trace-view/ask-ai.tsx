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

// Trace 5a9d5634... — LAM-1590 rust migration. Source of truth for span
// IDs in this mock conversation is the matching trace in laminar. Keep in
// sync with `understand-why-trace-view/index.tsx` TRACE_ID and the chip
// span IDs exported from `signal-event-card.tsx`.
const TRACE_ID = "5a9d5634-a465-3f53-119e-359363ecd0d6";
const PROJECT_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const spanLink = (label: string, spanId: string) =>
  `\`[${label}](https://lmnr.ai/project/${PROJECT_ID_PLACEHOLDER}/traces/${TRACE_ID}?spanId=${spanId})\``;

// Real span IDs inside trace 5a9d5634-a465-3f53-119e-359363ecd0d6.
const READ_EISDIR_SPAN = "00000000-0000-0000-9531-48e702ed15da";
const EDIT_NO_READ_SPAN = "00000000-0000-0000-4aee-680ebb392ebd";
const BASH_CHECKOUT_SPAN = "00000000-0000-0000-d1df-1033750d3977";
// Most expensive single LLM call in the trace ($1.78 / 7.5s).
const EXPENSIVE_LLM_SPAN = "00000000-0000-0000-405c-f341a1e0d0c1";

const INITIAL_RESPONSE = `#### Wasted time
The longest single span was ${spanLink("anthropic.messages", EXPENSIVE_LLM_SPAN)} at 7.5s ($1.78) — more than all three tool errors combined. The errors themselves (${spanLink("Read", READ_EISDIR_SPAN)} \`EISDIR\`, ${spanLink("Edit", EDIT_NO_READ_SPAN)} before reading, ${spanLink("Bash", BASH_CHECKOUT_SPAN)} \`checkout\` fail) were each under 2.5s direct, but each one triggers a recovery LLM turn that piles into the context window — which is what blew that single call up to $1.78.

#### Suggested fix
Enforce read-before-edit in the system prompt and validate paths and branches before calling tools. The recovery turns disappear and the context stops bloating into a single expensive call.`;

const INITIAL_MESSAGES: MockMessage[] = [
  {
    id: "init-user",
    role: "user",
    // Newcomer-perspective: a fresh-eyes ask that gets both the
    // forensic read (what failed) AND the forward-looking suggestion
    // (how to improve), so the assistant's answer can naturally cite
    // the three failure spans before suggesting fixes.
    text: "Which of these 4 failures wasted the most time, and how can I fix this?",
  },
  { id: "init-assistant", role: "assistant", text: INITIAL_RESPONSE },
];

const MOCK_RESPONSE = "Log in to chat with your traces";

// Each known span label gets mapped to its tool/llm classification so the
// chip can pick the right icon + color. Unknown labels fall through to
// "tool" (Bolt). FLAG: if INITIAL_RESPONSE references a new span name,
// add it here or it will render as a generic tool chip.
const LABEL_TO_KIND: Record<string, "tool" | "llm"> = {
  Read: "tool",
  Edit: "tool",
  Bash: "tool",
  "anthropic.messages": "llm",
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
