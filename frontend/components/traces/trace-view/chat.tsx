import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from "ai";
import { ArrowUp, MessageCircle, Send, Sparkles, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Trace } from '@/lib/traces/types';

interface ChatProps {
  trace: Trace;
}

export default function Chat({ trace }: ChatProps) {

  const [input, setInput] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const projectId = useParams().projectId;

  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/projects/${projectId}/chat`,
      body: {
        traceId: trace.id,
        traceStartTime: new Date(trace.startTime).toISOString(),
        traceEndTime: new Date(trace.endTime).toISOString(),
      }
    }),
  });

  // Fetch summary on component mount
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setSummaryLoading(true);
        const response = await fetch(`/api/projects/${projectId}/chat/summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            traceId: trace.id,
            traceStartTime: new Date(trace.startTime).toISOString(),
            traceEndTime: new Date(trace.endTime).toISOString(),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setSummary(data.summary);
        } else {
          console.error('Failed to fetch summary');
        }
      } catch (error) {
        console.error('Error fetching summary:', error);
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [trace.id, trace.startTime, trace.endTime, projectId]);

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
    <div className="flex-grow flex flex-col overflow-auto">
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div className="space-y-4 py-4">
          <div className="p-4">
            <div className="">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-foreground">Trace Summary</span>
              </div>
              {summaryLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating summary...</span>
                </div>
              ) : summary ? (
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {summary}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Failed to generate summary
                </div>
              )}
            </div>
          </div>

          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "px-3" : "px-5")}>
              <div className={cn("w-full", message.role === "user" ? "bg-muted/50 rounded px-2 py-1 border" : "bg-background")}>
                <div className="text-sm text-foreground leading-relaxed space-y-2">
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case 'text':
                        return (
                          <div key={`${message.id}-${i}`} className="whitespace-pre-wrap">
                            {part.text}
                          </div>
                        );
                      case 'tool-getSpansData':
                        // Handle tool invocations - simplified for now
                        return (
                          <div key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border border-border/50">
                            <div className="flex items-center gap-2">
                              <MessageCircle className="w-4 h-4 text-primary" />
                              <span className="text-xs font-medium text-muted-foreground">
                                Getting spans data
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {JSON.stringify(part.input)}
                            </div>
                          </div>
                        );
                    }
                  })}
                </div>
              </div>
            </div>
          ))
          }
        </div>
      </ScrollArea>

      <div className="flex-none px-3 pb-4 bg-transparent">
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
                className="absolute right-1 top-1 h-7 w-7 rounded-full border bg-primary"
                variant="ghost"
                onClick={() => sendMessage({
                  role: "user",
                  parts: [
                    { type: "text", text: input },
                  ],
                })}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
