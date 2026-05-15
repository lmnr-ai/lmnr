"use client";

import { ArrowUp, Bolt, MessageCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { cn } from "@/lib/utils";

interface MockMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const TRACE_ID = "3603700e-d02b-0c39-0f34-cfd20842c5ae";
const PROJECT_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const spanLink = (label: string, spanId: string) =>
  `\`[${label}](https://lmnr.ai/project/${PROJECT_ID_PLACEHOLDER}/traces/${TRACE_ID}?spanId=${spanId})\``;

const INITIAL_RESPONSE = `To improve efficiency, consolidate ${spanLink("navigate", "00000000-0000-0000-0d3a-ac0492ff722f")} span and ${spanLink("readPage", "00000000-0000-0000-4eb1-e78cf1b0ed69")} ${spanLink("readPage", "00000000-0000-0000-3191-542d50e2dc74")} span into a single tool call to halve LLM turns. Additionally, the readPage output is excessively large (12,000+ characters); implementing targeted extraction would reduce processing time and token costs for the final summary ${spanLink("ai.generateText.doGenerate", "00000000-0000-0000-c897-ab53f4b4d8d9")} span. Finally, providing a search tool would prevent the agent from navigating to suboptimal pages ${spanLink("navigate", "00000000-0000-0000-0d3a-ac0492ff722f")} span before finding the correct source ${spanLink("navigate", "00000000-0000-0000-7940-6191c6c4189c")} span.`;

const INITIAL_MESSAGES: MockMessage[] = [
  {
    id: "init-user",
    role: "user",
    text: "How would you recommend improving the research agent's tool call efficiency?",
  },
  { id: "init-assistant", role: "assistant", text: INITIAL_RESPONSE },
];

const MOCK_RESPONSE = "Log in to chat with your traces";

// Each known span label gets mapped to its tool/llm classification so the
// chip can pick the right icon + color. Unknown labels fall through to
// "tool" (Bolt). FLAG: if INITIAL_RESPONSE references a new span name,
// add it here or it will render as a generic tool chip.
const LABEL_TO_KIND: Record<string, "tool" | "llm"> = {
  navigate: "tool",
  readPage: "tool",
  "ai.generateText.doGenerate": "llm",
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

// Matches the markdown link text rendered inside backtick `code` elements:
//   [label](https://.../traces/<traceId>?spanId=<uuid>)
const MD_LINK_RE = /^\[([^\]]+)\]\((.+?spanId=([0-9a-f-]+).*)\)$/;

// Word-by-word streaming reveal of the initial assistant response. Tokens
// are whitespace-delimited; backtick-wrapped span links are guaranteed
// single tokens (no internal whitespace in the URLs), so we never render a
// half-broken chip mid-stream.
const STREAM_INTERVAL_MS = 30;

export default function AskAi() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);

  const selectSpanById = useTraceViewBaseStore((state) => state.selectSpanById);

  const words = useMemo(() => INITIAL_RESPONSE.split(/\s+/), []);
  const [streamedCount, setStreamedCount] = useState(0);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setStreamedCount(n);
      if (n >= words.length) clearInterval(id);
    }, STREAM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [words.length]);
  const streamedAssistantText = useMemo(() => words.slice(0, streamedCount).join(" "), [words, streamedCount]);

  const components = useMemo<{ code: (props: { children?: ReactNode }) => ReactNode }>(
    () => ({
      code: ({ children }) => {
        const text = String(children);
        const m = text.match(MD_LINK_RE);
        if (m) {
          const label = m[1];
          const spanId = m[3];
          const kind = LABEL_TO_KIND[label] ?? "tool";
          return <SpanChip kind={kind} label={label} onClick={() => selectSpanById(spanId)} />;
        }
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
