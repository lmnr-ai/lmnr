import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { TraceViewTrace, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatProps {
  trace: TraceViewTrace;
  onSetSpanId: (spanId: string) => void;
}

export default function Chat({ trace, onSetSpanId }: ChatProps) {
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [spanIdsMap, setSpanIdsMap] = useState<Record<string, string> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const { setSearch } = useTraceViewStoreContext((state) => ({
    setSearch: state.setSearch,
  }));

  const inputRef = useRef<HTMLInputElement>(null);

  const components = useMemo(
    () => ({
      code: ({ children }: any) => {
        const text = String(children);

        const xmlSpanMatch = text.match(/<span\s+id='(\d+)'\s+name='([^']+)'\s*\/>/);
        if (xmlSpanMatch) {
          const [, spanId, spanName] = xmlSpanMatch;
          const spanUuid = spanIdsMap?.[spanId];
          return (
            <button
              onClick={() => {
                onSetSpanId(spanUuid || "");
              }}
            >
              <span className="bg-primary/70 rounded px-1.5 py-[0.125rem] font-mono text-xs">{spanName}</span> span
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
          const spanUuid = spanIdsMap?.[spanId];

          const previewLength = 24;
          const textPreview =
            unescapedReferenceText.length > previewLength
              ? unescapedReferenceText.slice(0, previewLength) + "..."
              : unescapedReferenceText;

          return (
            <button
              onClick={() => {
                setSearch(unescapedReferenceText);
                onSetSpanId(spanUuid || "");
              }}
            >
              <span className="bg-primary/70 rounded px-1.5 py-[0.125rem] font-mono text-xs mr-1">{spanName}</span>
              span
              <span className="text-xs text-muted-foreground ml-1 font-mono">({textPreview})</span>
            </button>
          );
        }

        return <span className="text-xs bg-secondary rounded text-white font-mono px-1.5 py-0.5">{children}</span>;
      },
    }),
    [spanIdsMap, onSetSpanId, setSearch]
  );
  const projectId = useParams().projectId;

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

  // Fetch summary on component mount
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setSummaryLoading(true);
        const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/agent/summary`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            traceStartTime: new Date(trace.startTime).toISOString(),
            traceEndTime: new Date(trace.endTime).toISOString(),
          }),
        });

        if (response.ok) {
          const data = await response.json();

          const { summary, analysis, spanIdsMap } = data;

          const summaryAndAnalysis = `
${summary}

---

${analysis}`;

          setSummary(summaryAndAnalysis);
          setSpanIdsMap(spanIdsMap);
        } else {
          console.error("Failed to fetch summary");
        }
      } catch (error) {
        console.error("Error fetching summary:", error);
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [trace.id, trace.startTime, trace.endTime, projectId]);

  return (
    <div className="flex-grow flex flex-col overflow-auto">
      <Conversation>
        <ConversationContent className="space-y-4 py-4 px-0 pb-12">
          <div className="p-4">
            <div className="">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">Trace Summary</span>
                {messages.length > 0 && (
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
                )}
              </div>
              {summaryLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating summary...</span>
                </div>
              ) : summary ? (
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  <Response components={components}>{summary}</Response>
                </div>
              ) : null}
            </div>
          </div>

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
            className="py-1 pr-1"
          >
            <div className="relative">
              <Input
                ref={inputRef}
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
                placeholder="Ask about performance, errors, or trace insights..."
                className="pr-12 bg-transparent border-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7 rounded-full border bg-primary"
                variant="ghost"
                disabled={input.trim() === "" || summary === null || status === "streaming"}
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
