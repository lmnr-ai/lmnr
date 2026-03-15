"use client";

import { type UIMessage } from "ai";
import { Loader2 } from "lucide-react";

import { Response } from "@/components/ai-elements/response";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: UIMessage[];
  status: string;
}

export default function MessageList({ messages, status }: MessageListProps) {
  return (
    <>
      {messages.map((message) => (
        <div key={message.id} className={cn("flex", message.role === "user" ? "px-3" : "px-5")}>
          <div
            className={cn("w-full", message.role === "user" ? "bg-muted/50 rounded px-2 py-1 border" : "bg-background")}
          >
            <div className="text-sm text-foreground leading-relaxed space-y-2">
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div key={`${message.id}-${i}`}>
                      <Response>{part.text}</Response>
                    </div>
                  );
                }
                return null;
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
  );
}
