"use client";

import { ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { renderSpanReferences } from "@/components/traces/trace-view/span-reference";
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

const INITIAL_RESPONSE = `The agent updated Laminar's evaluation docs (LAM-1505), hiding the "human evaluators" section and removing inbound cross-links throughout.

It analyzed the TypeScript and Python SDKs ${spanLink("Agent", "00000000-0000-0000-b3a4-de1dcfa10968")} span, finding a divergence in how each handles trace linking. After surveying OpenHands' production usage ${spanLink("WebFetch", "00000000-0000-0000-855c-25e925eae184")} span, it rewrote \`manual-evaluation.mdx\` around a three-phase pattern: initialize evaluations, pre-register datapoints for immediate UI visibility, then asynchronously update scores.

It then brought up the local stack ${spanLink("Bash", "00000000-0000-0000-4ffe-47616df299a7")} span, ran an evaluation script ${spanLink("Write", "00000000-0000-0000-68ea-61caaea775d4")} span, and used \`agent-browser\` to capture screenshots of the detail and transcript views. It concluded by updating \`CLAUDE.md\` and pushing to PR #141 ${spanLink("Bash", "00000000-0000-0000-ed5d-660bacfbb704")} span.`;

const INITIAL_MESSAGES: MockMessage[] = [
  { id: "init-user", role: "user", text: "Summarize this trace" },
  { id: "init-assistant", role: "assistant", text: INITIAL_RESPONSE },
];

const MOCK_RESPONSE = "Log in to chat with your traces";

export default function AskAi() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);

  const { spans, setSelectedSpan } = useTraceViewBaseStore(
    (state) => ({ spans: state.spans, setSelectedSpan: state.setSelectedSpan }),
    shallow
  );

  const spanRefCallbacks = useMemo(
    () => ({
      resolveSpanId: async () => null,
      onSelectSpan: (spanUuid: string) => {
        const span = spans.find((s) => s.spanId === spanUuid);
        if (span) setSelectedSpan({ ...span, collapsed: false });
      },
    }),
    [spans, setSelectedSpan]
  );

  const components = useMemo(
    () => ({
      code: ({ children }: { children?: React.ReactNode }) => {
        const text = String(children);
        const rendered = renderSpanReferences(text, spanRefCallbacks);
        if (rendered) return rendered;
        return <span className="text-xs bg-secondary rounded text-white font-mono px-1.5 py-0.5">{children}</span>;
      },
    }),
    [spanRefCallbacks]
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
                  <Response components={components}>{m.text}</Response>
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
