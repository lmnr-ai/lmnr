import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2, MessageCircleQuestion, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { type TraceViewTrace, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "What happened in this trace? Give me a summary.",
  "Are there any errors or failures in this trace?",
  "What was the LLM's reasoning in this trace?",
];

interface ChatProps {
  trace: TraceViewTrace;
  onSetSpanId: (spanId: string) => void;
}

export default function Chat({ trace, onSetSpanId }: ChatProps) {
  const [input, setInput] = useState("");
  const [newChatLoading, setNewChatLoading] = useState(false);
  const { setSearch } = useTraceViewStoreContext((state) => ({
    setSearch: state.setSearch,
  }));
  const projectId = useParams().projectId;

  // Resolve sequential span ID to UUID on-demand
  const resolveSpanId = useCallback(async (sequentialId: string): Promise<string | null> => {
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
  }, [projectId, trace.id]);

  const handleExampleClick = (question: string) => {
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: question }],
    });
  };

  const components = useMemo(
    () => ({
      code: ({ children }: any) => {
        const text = String(children);

        const xmlSpanMatch = text.match(/<span\s+id='(\d+)'\s+name='([^']+)'\s*\/>/);
        if (xmlSpanMatch) {
          const [, spanId, spanName] = xmlSpanMatch;
          return (
            <button
              onClick={async () => {
                const spanUuid = await resolveSpanId(spanId);
                if (spanUuid) {
                  onSetSpanId(spanUuid);
                }
              }}
            >
              <span className="bg-primary/70 rounded px-1.5 py-0.5 font-mono text-xs">{spanName}</span> span
            </button>
          );
        }

        const xmlSpanWithReferenceTextMatch = text.match(
          /<span\s+id='(\d+)'\s+name='([^']+)'\s+reference_text='(.*?)'\s*\/>/
        );

        if (xmlSpanWithReferenceTextMatch) {
          const [, spanId, spanName, referenceText] = xmlSpanWithReferenceTextMatch;
          // Unescape any escaped quotes in the reference text
          const unescapedReferenceText = referenceText.replace(/\\"/g, '"');

          const previewLength = 24;
          const textPreview =
            unescapedReferenceText.length > previewLength
              ? unescapedReferenceText.slice(0, previewLength) + "..."
              : unescapedReferenceText;

          return (
            <button
              onClick={async () => {
                setSearch(unescapedReferenceText);
                const spanUuid = await resolveSpanId(spanId);
                if (spanUuid) {
                  onSetSpanId(spanUuid);
                }
              }}
            >
              <span className="bg-primary/70 rounded px-1.5 py-0.5 font-mono text-xs mr-1">{spanName}</span>
              span
              <span className="text-xs text-muted-foreground ml-1 font-mono">({textPreview})</span>
            </button>
          );
        }

        return <span className="text-xs bg-secondary rounded text-white font-mono px-1.5 py-0.5">{children}</span>;
      },
    }),
    [resolveSpanId, onSetSpanId, setSearch]
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
      // save assitant message in the UI format
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

  // Load existing messages when component mounts
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

  return (
    <div className="grow flex flex-col overflow-auto">
      <Conversation>
        <ConversationContent className="space-y-4 py-4 px-0 pb-12">
          {messages.length === 0 && status !== "submitted" && status !== "streaming" ? (
            <div className="flex flex-col items-center justify-center h-full px-4 py-8">
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
                <div className="px-4 flex justify-end">
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
        <div className="border rounded bg-muted/40">
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
                placeholder="Ask about logical errors, insights, or anything else..."
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
        </div>
      </div>
      <span className="text-xs text-muted-foreground/50 text-center pb-2">
        Trace assistant is in beta and can make mistakes
      </span>
    </div>
  );
}
