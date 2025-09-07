import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from "ai";
import { ArrowUp, MessageCircle, Send, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Trace } from '@/lib/traces/types';
import { Response } from '@/components/ai-elements/response';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';


interface ChatProps {
  trace: Trace;
}

export default function Chat({ trace }: ChatProps) {

  const [input, setInput] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const projectId = useParams().projectId;

  const { messages, sendMessage, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/projects/${projectId}/traces/${trace.id}/agent`,
      body: {
        traceStartTime: new Date(trace.startTime).toISOString(),
        traceEndTime: new Date(trace.endTime).toISOString(),
      }
    }),
    onFinish: async ({ message }) => {
      // save assitant message in the UI format
      try {
        const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/agent/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'assistant',
            parts: message.parts,
            messageId: message.id,
          }),
        });

        if (!response.ok) {
          console.error('Failed to save assistant message:', response.statusText);
        }
      } catch (error) {
        console.error('Error saving assistant message:', error);
      }
    }
  });

  const handleNewChat = async () => {
    setNewChatLoading(true);
    try {
      // Create a new chat session in the database
      const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/agent/new-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Clear all messages to start a new conversation
        setMessages([]);
      } else {
        console.error('Failed to create new chat session');
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
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
        console.error('Error loading existing messages:', error);
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
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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

  useEffect(() => {
    console.log('messages', messages);
  }, [messages]);

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
                  <Response>{summary}</Response>
                </div>
              ) : null}
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
                          <div key={`${message.id}-${i}`}>
                            <Response>
                              {part.text}
                            </Response>
                          </div>
                        );
                      case 'tool-getSpansData':
                        // Handle tool invocations - simplified for now
                        return (
                          <div key={`${message.id}-${i}`} className="bg-muted/50 rounded-lg p-3 border">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Fetching spans data
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
          }
        </ConversationContent>
      </Conversation>

      <div className="flex-none px-3 pb-4 bg-transparent">
        <div className="border rounded bg-muted/40">
          <form onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              sendMessage({
                role: "user",
                parts: [
                  { type: "text", text: input },
                ],
              });
              setInput('');
            }
          }}
            className="py-2 pr-1"
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
                        parts: [
                          { type: "text", text: input },
                        ],
                      });
                      setInput('');
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
                disabled={input.trim() === ''}
                onClick={() => {
                  if (input.trim()) {
                    sendMessage({
                      role: "user",
                      parts: [
                        { type: "text", text: input },
                      ],
                    });
                    setInput('');
                  }
                }}
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
