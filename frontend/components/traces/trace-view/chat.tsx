import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from "ai";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ChatProps {
  traceId: string;
  spans: any[]; // TODO: Type this properly
}

export default function Chat({ traceId, spans }: ChatProps) {

  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const projectId = useParams().projectId;

  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/projects/${projectId}/chat`,
    }),
  });

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    console.log('Messages', messages);
    // if (scrollAreaRef.current) {
    //   const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    //   if (scrollContainer) {
    //     scrollContainer.scrollTop = scrollContainer.scrollHeight;
    //   }
    // }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <ScrollArea className="flex-1 p-0" ref={scrollAreaRef}>
        <div className="space-y-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-start justify-center text-left py-8 p-4">
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
              <div key={message.id} className={cn("flex", message.role === "user" ? "px-2" : "px-4")}>
                <div className={cn("w-full", message.role === "user" ? "bg-muted/50 rounded px-2 py-1 border" : "bg-background")}>
                  <div className="text-sm text-foreground leading-relaxed space-y-2">
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <div key={`${message.id}-${i}`}>
                              {part.text}
                            </div>
                          );
                        case 'tool-weather':
                          // Handle tool invocations - simplified for now
                          return (
                            <div key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border border-border/50">
                              <div className="flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-primary" />
                                <span className="text-xs font-medium text-muted-foreground">
                                  Weather tool
                                </span>
                              </div>
                            </div>
                          );
                      }
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input Footer */}
      <div className="p-3">
        <div className="border rounded bg-muted/40">
          <form onSubmit={(e) => {
            e.preventDefault();
            sendMessage({
              role: "user",
              parts: [
                { type: "text", text: input },
              ],
            });
          }}
          className="p-2"
          >
            <div className="relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage({
                      role: "user",
                      parts: [
                        { type: "text", text: input },
                      ],
                    });
                  }
                }}
                placeholder="Ask about performance, errors, or trace insights..."
                className="pr-12 bg-transparent border-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7"
                variant="ghost"
                onClick={() => sendMessage({
                  role: "user",
                  parts: [
                    { type: "text", text: input },
                  ],
                })}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
