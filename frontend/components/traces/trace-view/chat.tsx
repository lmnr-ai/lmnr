import { MessageCircle, Send, User, Sparkles } from "lucide-react";
import React, { useRef, useEffect } from "react";
import { useChat } from '@ai-sdk/react';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ChatProps {
  traceId: string;
  spans: any[]; // TODO: Type this properly
}

export default function Chat({ traceId, spans }: ChatProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/traces/chat',
    body: {
      traceId,
      spans,
    },
  });

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <ScrollArea className="flex-1 p-0" ref={scrollAreaRef}>
        <div className="p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-start justify-center text-left py-8">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="text-lg font-medium text-foreground">Chat with your trace</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                I can help you understand this trace with {spans.length} span{spans.length !== 1 ? 's' : ''}. Ask me about:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Performance bottlenecks and optimization opportunities</li>
                <li>• Error analysis and debugging insights</li>
                <li>• Execution flow and span relationships</li>
                <li>• Token usage and cost analysis</li>
              </ul>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  {message.role === "user" ? (
                    <User className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {message.role === "user" ? "You" : "Assistant"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.createdAt || Date.now()).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="text-sm text-foreground leading-relaxed space-y-2">
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <div key={`${message.id}-${i}`}>
                              {part.text}
                            </div>
                          );
                        case 'tool-invocation':
                          // Handle tool invocations - simplified for now
                          return (
                            <div key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border border-border/50">
                              <div className="flex items-center gap-2 mb-2">
                                <MessageCircle className="w-4 h-4 text-primary" />
                                <span className="text-xs font-medium text-muted-foreground">
                                  Tool Invocation
                                </span>
                              </div>
                              <pre className="text-xs overflow-x-auto">
                                {JSON.stringify(part, null, 2)}
                              </pre>
                            </div>
                          );
                        default:
                          return (
                            <pre key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border border-border/50 text-xs overflow-x-auto">
                              {JSON.stringify(part, null, 2)}
                            </pre>
                          );
                      }
                    })}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-muted-foreground">Analyzing trace data...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Footer */}
      <div className="p-4">
        <div className="border rounded bg-muted/40">
          <form onSubmit={handleSubmit} className="p-2">
            <div className="relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Ask about performance, errors, or trace insights..."
                className="pr-12 bg-transparent border-none focus-visible:ring-0"
                disabled={isLoading}
              />
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                size="icon"
                className="absolute right-1 top-1 h-7 w-7"
                variant="ghost"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>

          {/* Agent Info Footer */}
          <div className="px-4 pb-3 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              <span>Agent</span>
              <span className="text-primary font-medium">AI</span>
              <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">MAX</span>
            </div>
            <div className="flex items-center gap-1">
              <span>{spans.length} spans available</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
