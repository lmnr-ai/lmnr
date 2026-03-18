"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion } from "framer-motion";
import { ArrowUp, Columns2, Loader2, MessageCircleQuestion, PanelRight, RotateCcw, X } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { type AgentViewMode, useLaminarAgentStore } from "./store";
import { CompactTraceCard, SqlToolCard } from "./tool-call-cards";

const EXAMPLE_QUESTIONS = [
  "Summarize the trace I'm looking at.",
  "Are there any errors in recent traces?",
  "What is the average cost per trace today?",
];

interface AgentPanelProps {
  currentMode: "floating" | "side-by-side";
}

/**
 * Extracts traceId from the current pathname if the user is on a trace page.
 * Expected pattern: /project/{projectId}/traces/{traceId}
 */
function extractTraceIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/\/project\/[^/]+\/traces\/([^/]+)/);
  return match?.[1];
}

export default function AgentPanel({ currentMode }: AgentPanelProps) {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const collapse = useLaminarAgentStore((s) => s.collapse);
  const prefillInput = useLaminarAgentStore((s) => s.prefillInput);
  const clearPrefill = useLaminarAgentStore((s) => s.clearPrefill);

  const projectId = useParams().projectId as string;
  const pathname = usePathname();
  const traceId = extractTraceIdFromPath(pathname);

  // Handle prefill: initialize input from store prefill if present
  const initialInput = useMemo(() => {
    if (prefillInput) {
      // Clear prefill on next tick to avoid re-triggering
      queueMicrotask(() => clearPrefill());
      return prefillInput;
    }
    return "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [input, setInput] = useState(initialInput);

  const alternateMode: AgentViewMode = currentMode === "floating" ? "side-by-side" : "floating";
  const alternateModeLabel = currentMode === "floating" ? "Switch to side-by-side" : "Switch to floating";
  const AlternateModeIcon = currentMode === "floating" ? PanelRight : Columns2;

  const resolveSpanId = useCallback(
    async (sequentialId: string): Promise<string | null> => {
      if (!traceId) return null;
      try {
        const response = await fetch(
          `/api/projects/${projectId}/traces/${traceId}/agent/resolve-span?id=${sequentialId}`
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
    [projectId, traceId]
  );

  const handleSpanClick = useCallback(async (spanUuid: string) => {
    // Use nuqs-compatible URL update for spanId
    const url = new URL(window.location.href);
    url.searchParams.set("spanId", spanUuid);
    window.history.pushState({}, "", url.toString());
    // Dispatch a popstate event so nuqs picks up the change
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

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
                  handleSpanClick(spanUuid);
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
          const unescapedReferenceText = referenceText.replace(/\\"/g, '"');
          const previewLength = 24;
          const textPreview =
            unescapedReferenceText.length > previewLength
              ? unescapedReferenceText.slice(0, previewLength) + "..."
              : unescapedReferenceText;

          return (
            <button
              onClick={async () => {
                const spanUuid = await resolveSpanId(spanId);
                if (spanUuid) {
                  handleSpanClick(spanUuid);
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
    [resolveSpanId, handleSpanClick]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/projects/${projectId}/agent`,
        body: {
          context: { traceId },
        },
      }),
    [projectId, traceId]
  );

  const { messages, sendMessage, setMessages, status } = useChat({
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

  const handleNewChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  // Handle subsequent prefills (after initial mount)
  const lastPrefillRef = useRef(prefillInput);
  if (prefillInput && prefillInput !== lastPrefillRef.current) {
    lastPrefillRef.current = prefillInput;
    setInput(prefillInput);
    clearPrefill();
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 h-10 border-b shrink-0">
        <span className="text-sm font-medium">Laminar Agent</span>
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode(alternateMode)}>
                  <AlternateModeIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{alternateModeLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={collapse}>
                  <X className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="grow flex flex-col overflow-auto relative">
        <Conversation>
          <ConversationContent className="space-y-4 py-4 px-0 pb-12">
            {messages.length === 0 && status !== "submitted" && status !== "streaming" ? (
              <div className="flex flex-col items-center justify-center h-full px-4 py-8">
                <MessageCircleQuestion className="size-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
                  Ask questions about your traces, signals, or anything on the platform.
                </p>
                <div className="w-full max-w-md space-y-2">
                  {EXAMPLE_QUESTIONS.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        sendMessage({
                          role: "user",
                          parts: [{ type: "text", text: question }],
                        });
                      }}
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
                    <Button onClick={handleNewChat} variant="outline" size="sm" className="h-7 text-xs">
                      <RotateCcw className="w-3 h-3 mr-1" />
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
                            case "tool-compactTraceContext": {
                              const isTraceLoading = part.state !== "output-available";
                              return <CompactTraceCard key={`${message.id}-${i}`} isLoading={isTraceLoading} />;
                            }
                            case "tool-executeSql": {
                              const isSqlLoading = part.state !== "output-available";
                              const sqlInput =
                                part.state !== "input-streaming" ? (part.input as { query?: string }) : null;
                              const query = sqlInput?.query ?? "";
                              return <SqlToolCard key={`${message.id}-${i}`} query={query} isLoading={isSqlLoading} />;
                            }
                            default:
                              return null;
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
      </div>

      <div className="shrink-0 px-3 pb-2 bg-transparent">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="border rounded-lg bg-muted/40"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <div className="relative p-0 flex w-full py-1">
              <DefaultTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about traces, signals, costs, or anything else..."
                className="bg-transparent border-none focus-visible:ring-0 resize-none w-full"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-1 bottom-2 h-7 w-7 rounded-full border bg-primary"
                variant="ghost"
                disabled={input.trim() === "" || status === "streaming"}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </motion.div>
        <span className="text-xs text-muted-foreground/50 text-center block pt-1 pb-1">
          Laminar Agent is in beta and can make mistakes
        </span>
      </div>
    </div>
  );
}
