"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Database, Loader2, MessageCircleQuestion, RotateCcw, Sparkles, X } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { RENDER_COMPONENT_REGISTRY } from "@/components/ai-chat/render-components";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { useAIChatStore } from "@/lib/ai-chat/store";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "What happened in this trace? Give me a summary.",
  "Are there any errors or failures?",
  "How many traces were processed in the last hour?",
  "What is the average latency of LLM calls?",
];

const TRACE_EXAMPLE_QUESTIONS = [
  "What happened in this trace? Give me a summary.",
  "Are there any errors or failures in this trace?",
  "What was the LLM's reasoning in this trace?",
];

const EVAL_EXAMPLE_QUESTIONS = [
  "How are scores distributed in this evaluation?",
  "What are the common failure patterns?",
  "Summarize this evaluation's results.",
];

export default function SidePanelChat() {
  const [input, setInput] = useState("");
  const { projectId } = useParams();
  const pathname = usePathname();
  const { isOpen, setOpen, pageContext } = useAIChatStore((state) => ({
    isOpen: state.isOpen,
    setOpen: state.setOpen,
    pageContext: state.pageContext,
  }));

  const hasTraceContext = !!pageContext.traceView?.traceId;
  const hasEvalContext = !!pageContext.evaluation?.evaluationId;

  const exampleQuestions = useMemo(() => {
    if (hasTraceContext) return TRACE_EXAMPLE_QUESTIONS;
    if (hasEvalContext) return EVAL_EXAMPLE_QUESTIONS;
    return EXAMPLE_QUESTIONS;
  }, [hasTraceContext, hasEvalContext]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/projects/${projectId}/ai-chat`,
        body: {
          pageContext,
        },
      }),
    [projectId, pageContext]
  );

  const { messages, sendMessage, setMessages, status } = useChat({
    transport,
  });

  const handleExampleClick = (question: string) => {
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: question }],
    });
  };

  const handleNewChat = () => {
    setMessages([]);
  };

  const handleSubmit = useCallback(() => {
    if (input.trim()) {
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: input }],
      });
      setInput("");
    }
  }, [input, sendMessage]);

  const components = useMemo(
    () => ({
      code: ({ children }: any) => {
        const text = String(children);

        const xmlSpanMatch = text.match(/<span\s+id='(\d+)'\s+name='([^']+)'\s*\/>/);
        if (xmlSpanMatch) {
          const [, , spanName] = xmlSpanMatch;
          return <span className="bg-primary/70 rounded px-1.5 py-0.5 font-mono text-xs">{spanName}</span>;
        }

        const xmlSpanWithReferenceTextMatch = text.match(
          /<span\s+id='(\d+)'\s+name='([^']+)'\s+reference_text='(.*?)'\s*\/>/
        );
        if (xmlSpanWithReferenceTextMatch) {
          const [, , spanName, referenceText] = xmlSpanWithReferenceTextMatch;
          const unescapedReferenceText = referenceText.replace(/\\"/g, '"');
          const previewLength = 24;
          const textPreview =
            unescapedReferenceText.length > previewLength
              ? unescapedReferenceText.slice(0, previewLength) + "..."
              : unescapedReferenceText;

          return (
            <span>
              <span className="bg-primary/70 rounded px-1.5 py-0.5 font-mono text-xs mr-1">{spanName}</span>
              <span className="text-xs text-muted-foreground ml-1 font-mono">({textPreview})</span>
            </span>
          );
        }

        return <span className="text-xs bg-secondary rounded text-white font-mono px-1.5 py-0.5">{children}</span>;
      },
    }),
    []
  );

  // Context badge text
  const contextBadge = useMemo(() => {
    if (hasTraceContext) {
      return `Trace: ${pageContext.traceView!.traceId.slice(0, 8)}...`;
    }
    if (hasEvalContext) {
      const name = pageContext.evaluation!.evaluationName;
      return `Eval: ${name || pageContext.evaluation!.evaluationId.slice(0, 8) + "..."}`;
    }
    return null;
  }, [hasTraceContext, hasEvalContext, pageContext]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="flex-none h-full border-l bg-background overflow-hidden"
        >
          <div className="flex flex-col h-full w-[400px]">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b flex-none">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Ask AI</span>
                {contextBadge && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{contextBadge}</span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Chat area */}
            <div className="grow flex flex-col overflow-auto relative minimal-scrollbar">
              <div className="w-full h-[28px] bg-gradient-to-b from-background to-transparent top-0 left-0 absolute z-10 pointer-none" />
              <Conversation>
                <ConversationContent className="space-y-4 py-4 px-0 pb-12">
                  {messages.length === 0 && status !== "submitted" && status !== "streaming" ? (
                    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
                      <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
                        Ask questions about your traces, evaluations, or query your data with SQL.
                      </p>
                      <div className="w-full max-w-md space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageCircleQuestion className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">Try asking</span>
                        </div>
                        {exampleQuestions.map((question, index) => (
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
                                  case "tool-getSpansData":
                                    return (
                                      <div key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-muted-foreground">
                                            Fetching spans data
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  case "tool-executeSQL":
                                    return (
                                      <div key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border">
                                        <div className="flex items-center gap-2">
                                          <Database className="w-3.5 h-3.5 text-muted-foreground" />
                                          <span className="text-xs font-medium text-muted-foreground">
                                            Executing SQL query
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  default: {
                                    // Handle render tool results - extract tool name from part type
                                    const toolName = part.type.startsWith("tool-") ? part.type.slice(5) : null;
                                    const RenderComponent = toolName ? RENDER_COMPONENT_REGISTRY[toolName] : null;
                                    if (RenderComponent && (part as any).result) {
                                      try {
                                        const data =
                                          typeof (part as any).result === "string"
                                            ? JSON.parse((part as any).result)
                                            : (part as any).result;
                                        return (
                                          <div key={`${message.id}-${i}`}>
                                            <RenderComponent data={data} />
                                          </div>
                                        );
                                      } catch {
                                        // Fall through to null if parse fails
                                      }
                                    }
                                    return null;
                                  }
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

            {/* Input area */}
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
                    handleSubmit();
                  }}
                >
                  <div className="relative p-0 flex w-full py-1">
                    <DefaultTextarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="Ask about traces, evals, or query data..."
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
            </div>
            <span className="text-xs text-muted-foreground/50 text-center pb-2">
              AI assistant is in beta and can make mistakes
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
