"use client";

import { useChat } from "@ai-sdk/react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import ChatInput from "@/components/laminar-agent/chat-input";
import EmptyState from "@/components/laminar-agent/empty-state";
import MessageList from "@/components/laminar-agent/message-list";
import { useToast } from "@/lib/hooks/use-toast";

import { useLaminarAgentStore } from "./store";

interface AgentChatPanelProps {
  header?: React.ReactNode;
  maxWidth?: string;
}

export default function AgentChatPanel({ header, maxWidth = "max-w-3xl" }: AgentChatPanelProps) {
  const projectId = useParams().projectId as string;
  const getOrCreateChat = useLaminarAgentStore((s) => s.getOrCreateChat);
  const setPersistedMessages = useLaminarAgentStore((s) => s.setPersistedMessages);
  const persistedMessages = useLaminarAgentStore((s) => s.persistedMessages);
  const [input, setInput] = useState("");
  const { toast } = useToast();

  const chat = getOrCreateChat(projectId);
  const { messages, setMessages, sendMessage, status, error } = useChat({
    chat,
    onError: (err) => {
      const containsHtml = /<[a-z][\s\S]*>/i.test(err.message);
      toast({
        title: "Agent error",
        description: containsHtml
          ? "Something went wrong. Please try again."
          : err.message || "Failed to get a response. Please try again.",
        variant: "destructive",
      });
    },
  });

  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!hasRestoredRef.current && messages.length === 0 && persistedMessages.length > 0) {
      setMessages(persistedMessages);
      hasRestoredRef.current = true;
    }
  }, [messages.length, persistedMessages, setMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setPersistedMessages(messages);
    }
  }, [messages, setPersistedMessages]);

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
      {header}
      <div className="grow flex flex-col overflow-auto relative minimal-scrollbar">
        <div className="w-full h-[28px] bg-gradient-to-b from-background to-transparent top-0 left-0 absolute z-10 pointer-events-none" />
        <Conversation>
          <ConversationContent className={`space-y-4 py-4 px-0 pb-12 ${maxWidth} mx-auto w-full`}>
            {isEmpty ? (
              <EmptyState onSuggestionClick={handleSuggestionClick} />
            ) : (
              <>
                <MessageList messages={messages} status={status} />
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    Something went wrong:{" "}
                    {/<[a-z][\s\S]*>/i.test(error.message)
                      ? "Please try again."
                      : error.message || "Failed to get a response."}
                  </div>
                )}
              </>
            )}
          </ConversationContent>
        </Conversation>

        <div className={`${maxWidth} mx-auto w-full`}>
          <ChatInput input={input} onInputChange={setInput} onSend={handleSend} isDisabled={isStreaming} />
          <span className="text-[10px] text-muted-foreground/50 text-center pb-4 block">
            Laminar Agent is in beta and can make mistakes
          </span>
        </div>
      </div>
    </div>
  );
}
