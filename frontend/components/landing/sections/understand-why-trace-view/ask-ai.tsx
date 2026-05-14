"use client";

import { ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

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

// Copy of the old composable-trace ask-ai mock. Keeps the same hardcoded
// trace/span link references — they're decorative inside this mock.
export default function AskAi() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);

  const selectSpanById = useTraceViewBaseStore((state) => state.selectSpanById);

  const spanRefCallbacks = useMemo(
    () => ({
      resolveSpanId: async () => null,
      onSelectSpan: (spanUuid: string) => selectSpanById(spanUuid),
    }),
    [selectSpanById]
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
