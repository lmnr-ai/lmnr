"use client";

import { type UIMessage } from "ai";
import { Loader2 } from "lucide-react";

import { Response } from "@/components/ai-elements/response";
import AgentCardRenderer from "@/components/laminar-agent/cards/renderer";
import ToolInvocationCard from "@/components/laminar-agent/tool-invocation";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: UIMessage[];
  status: string;
}

function isToolPart(part: { type: string }): boolean {
  return part.type.startsWith("tool-");
}

export default function MessageList({ messages, status }: MessageListProps) {
  return (
    <>
      {messages.map((message) => (
        <div key={message.id} className={cn("flex", message.role === "user" ? "px-3" : "px-5")}>
          <div
            className={cn(
              message.role === "user" ? "bg-muted/50 rounded px-2 py-1 border max-w-[85%]" : "w-full bg-background"
            )}
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
                if (isToolPart(part)) {
                  const toolPart = part as {
                    type: string;
                    state: string;
                    input?: Record<string, unknown>;
                    output?: unknown;
                  };
                  return (
                    <ToolInvocationCard
                      key={`${message.id}-${i}`}
                      toolName={toolPart.type.replace(/^tool-/, "")}
                      state={toolPart.state}
                      input={toolPart.input as Record<string, unknown>}
                      output={toolPart.output}
                    />
                  );
                }
                return null;
              })}
              {message.role === "assistant" && <AgentCardRenderer parts={message.parts} />}
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
