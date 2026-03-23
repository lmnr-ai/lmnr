import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion } from "framer-motion";
import { ArrowUp, Loader2, MessageCircleQuestion, RotateCcw, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { renderSpanReferences } from "@/components/traces/trace-view/span-reference";
import { type TraceViewTrace, useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "Summarize this trace",
  "Explain any errors in this trace",
  "How do I make my agent more efficient?",
];

interface ChatProps {
  trace: TraceViewTrace;
  onSetSpanId: (spanId: string) => void;
  onClose?: () => void;
}

export default function Chat({ trace, onSetSpanId, onClose }: ChatProps) {
  const [input, setInput] = useState("");
  const [newChatLoading, setNewChatLoading] = useState(false);
  const projectId = useParams().projectId;
  const hasInjectedRef = useRef(false);

  // Read injection state from store
  const { agentInitialMessages, agentPrefillInput, clearAgentInjection } = useTraceViewBaseStore((state) => ({
    agentInitialMessages: state.agentInitialMessages,
    agentPrefillInput: state.agentPrefillInput,
    clearAgentInjection: state.clearAgentInjection,
  }));

  // Resolve sequential span ID to UUID on-demand
  const resolveSpanId = useCallback(
    async (sequentialId: string): Promise<string | null> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/traces/${trace.id}/agent/resolve-span?id=${sequentialId}`
        );
        if (response.ok) {
          const data = await response.json();
          return data.spanId;
        }
      } catch (error) {
        console.error("Error resolving span ID:", error);
      }
      return null;
    },
    [projectId, trace.id]
  );

  const handleExampleClick = (question: string) => {
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: question }],
    });
  };

  const spanRefCallbacks = useMemo(
    () => ({
      resolveSpanId,
      onSelectSpan: onSetSpanId,
    }),
    [resolveSpanId, onSetSpanId]
  );

  const components = useMemo(
    () => ({
      code: ({ children }: any) => {
        const text = String(children);
        const rendered = renderSpanReferences(text, spanRefCallbacks);
        if (rendered) return rendered;
        return <span className="text-xs bg-secondary rounded text-white font-mono px-1.5 py-0.5">{children}</span>;
      },
    }),
    [spanRefCallbacks]
  );

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/projects/${projectId}/traces/${trace.id}/agent`,
      body: {
        traceStartTime: new Date(trace.startTime).toISOString(),
        traceEndTime: new Date(trace.endTime).toISOString(),
      },
    }),
    onFinish: async ({ message }) => {
      // save assistant message in the UI format
      try {
        const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/agent/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role: "assistant",
            parts: message.parts,
            messageId: message.id,
          }),
        });

        if (!response.ok) {
          console.error("Failed to save assistant message:", response.statusText);
        }
      } catch (error) {
        console.error("Error saving assistant message:", error);
      }
    },
  });

  const handleNewChat = async () => {
    setNewChatLoading(true);
    try {
      // Create a new chat session in the database
      const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/agent/new-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        // Clear all messages to start a new conversation
        setMessages([]);
      } else {
        console.error("Failed to create new chat session");
      }
    } catch (error) {
      console.error("Error creating new chat:", error);
      // Still clear messages even if API call fails
      setMessages([]);
    } finally {
      setNewChatLoading(false);
    }
  };

  // Effect 1: Load existing messages when the trace changes.
  // This only depends on trace.id and projectId — it won't re-run when
  // injection state changes.
  useEffect(() => {
    const loadExistingMessages = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/agent/messages`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          }
        }
      } catch (error) {
        console.error("Error loading existing messages:", error);
      }
    };

    loadExistingMessages();
  }, [trace.id, projectId, setMessages]);

  // Effect 2: One-time injection of messages from "Open in AI Chat".
  // Separated from the fetch effect so that clearAgentInjection() (which
  // nulls agentInitialMessages) doesn't re-trigger the fetch and overwrite
  // the injected messages.
  useEffect(() => {
    if (hasInjectedRef.current || !agentInitialMessages || agentInitialMessages.length === 0) return;
    hasInjectedRef.current = true;
    setMessages(agentInitialMessages);
    if (agentPrefillInput) {
      setInput(agentPrefillInput);
    }
    clearAgentInjection();
  }, [agentInitialMessages, agentPrefillInput, clearAgentInjection, setMessages]);

  return (
    <div className="flex flex-col overflow-hidden relative h-full">
      <div className="flex items-center justify-between px-2 pt-2 pb-2 flex-shrink-0 relative">
        <span className="text-base font-medium ml-2">Chat with trace</span>
        {onClose && (
          <Button variant="ghost" className="px-0.5 h-6 w-6" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
        <div className="w-full h-[28px] bg-gradient-to-b from-background to-transparent top-full left-0 absolute z-20 pointer-none pointer-events-none" />
      </div>
      <Conversation className="relative">
        <ConversationContent className="space-y-4 py-4 px-0 pb-12">
          {messages.length === 0 && status !== "submitted" && status !== "streaming" ? (
            <div className="flex flex-col items-center justify-center px-4 py-8">
              <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
                Ask questions about this trace to understand what happened, find errors, or get insights.
              </p>
              <div className="w-full max-w-md space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircleQuestion className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Try asking</span>
                </div>
                {EXAMPLE_QUESTIONS.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(question)}
                    className="w-full text-left px-3 py-2 text-sm rounded-md border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-border transition-colors text-foreground/80 hover:text-foreground"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.length > 0 && (
                <div className="px-4 flex justify-end pt-1">
                  <Button
                    onClick={handleNewChat}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={newChatLoading}
                  >
                    {newChatLoading ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3 mr-1" />
                    )}
                    New Chat
                  </Button>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "px-3" : "px-5")}>
                  <div
                    className={cn(
                      "w-full",
                      message.role === "user" ? "bg-muted/50 rounded px-2 py-1 border" : "bg-background"
                    )}
                  >
                    <div className="text-sm text-foreground leading-relaxed space-y-2">
                      {message.parts.map((part, i) => {
                        switch (part.type) {
                          case "text":
                            return (
                              <div key={`${message.id}-${i}`}>
                                <Response components={components}>{part.text}</Response>
                              </div>
                            );
                          case "tool-getSpansData":
                            return (
                              <div key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">Fetching spans data</span>
                                </div>
                              </div>
                            );
                        }
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {status === "submitted" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground px-5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </>
          )}
        </ConversationContent>
      </Conversation>

      <div className="flex-none px-3 pb-2 bg-transparent">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="border rounded-lg bg-muted/40"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                sendMessage({
                  role: "user",
                  parts: [{ type: "text", text: input }],
                });
                setInput("");
              }
            }}
          >
            <div className="relative p-0 flex w-full py-1">
              <DefaultTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) {
                      sendMessage({
                        role: "user",
                        parts: [{ type: "text", text: input }],
                      });
                      setInput("");
                    }
                  }
                }}
                placeholder="Summarize, find inefficiencies, explain errors..."
                className="bg-transparent border-none focus-visible:ring-0 resize-none w-full"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-1 bottom-2 h-7 w-7 rounded-full border bg-primary"
                variant="ghost"
                disabled={input.trim() === "" || status === "streaming"}
                onClick={() => {
                  if (input.trim()) {
                    sendMessage({
                      role: "user",
                      parts: [{ type: "text", text: input }],
                    });
                    setInput("");
                  }
                }}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
      <span className="text-xs text-muted-foreground/50 text-center pb-2">
        Trace assistant is in beta and can make mistakes
      </span>
    </div>
  );
}
