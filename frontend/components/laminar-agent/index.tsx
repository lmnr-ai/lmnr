"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Columns2, PanelRight } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import ChatInput from "@/components/laminar-agent/chat-input";
import EmptyState from "@/components/laminar-agent/empty-state";
import MessageList from "@/components/laminar-agent/message-list";
import { Button } from "@/components/ui/button";

import { useLaminarAgentStore } from "./store";

export default function LaminarAgent() {
  const projectId = useParams().projectId as string;
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/projects/${projectId}/agent`,
      }),
    [projectId]
  );

  const { messages, sendMessage, status } = useChat({
    id: `laminar-agent-${projectId}`,
    transport,
  });

  const handleSend = useCallback(() => {
    if (input.trim()) {
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: input }],
      });
      setInput("");
    }
  }, [input, sendMessage]);

  const handleSuggestionClick = useCallback(
    (question: string) => {
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: question }],
      });
    },
    [sendMessage]
  );

  const isStreaming = status === "streaming" || status === "submitted";
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h2 className="text-sm font-medium">Laminar Agent</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("floating")}>
            <Columns2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("sidebar")}>
            <PanelRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grow flex flex-col overflow-auto relative minimal-scrollbar">
        <div className="w-full h-[28px] bg-gradient-to-b from-background to-transparent top-0 left-0 absolute z-10 pointer-none" />
        <Conversation>
          <ConversationContent className="space-y-4 py-4 px-0 pb-12">
            {isEmpty ? (
              <EmptyState onSuggestionClick={handleSuggestionClick} />
            ) : (
              <MessageList messages={messages} status={status} />
            )}
          </ConversationContent>
        </Conversation>

        <ChatInput input={input} onInputChange={setInput} onSend={handleSend} isDisabled={isStreaming} />
        <span className="text-xs text-muted-foreground/50 text-center pb-2">
          Laminar Agent is in beta and can make mistakes
        </span>
      </div>
    </div>
  );
}
