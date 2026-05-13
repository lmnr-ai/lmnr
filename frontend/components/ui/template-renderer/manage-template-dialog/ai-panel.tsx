import { ArrowUp, RotateCcw, Sparkles, StopCircle } from "lucide-react";
import React, { useCallback } from "react";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { cn } from "@/lib/utils";

import { type ChatState } from "./use-stream-template";

interface AiPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
  state: ChatState;
}

const SUGGESTIONS = [
  "Status card with latency and cost",
  "Timeline of events with timestamps",
  "Key/value table with monospaced values",
  "Score gauge with color-coded threshold",
];

const AiPanel = ({ prompt, onPromptChange, onSend, onStop, onClear, state }: AiPanelProps) => {
  const isStreaming = state.status === "loading";
  const hasMessages = state.messages.length > 0;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (prompt.trim() && !isStreaming) onSend();
      }
    },
    [prompt, isStreaming, onSend]
  );

  const handleSuggestion = useCallback(
    (s: string) => {
      onPromptChange(s);
    },
    [onPromptChange]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {hasMessages ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-end px-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={isStreaming}
              className="h-7 gap-1 text-xs text-muted-foreground"
            >
              <RotateCcw className="size-3" />
              Clear chat
            </Button>
          </div>
          <Conversation className="flex-1">
            <ConversationContent className="flex flex-col gap-2 p-3 pt-1">
              {state.messages.map((m) => (
                <ChatBubble key={m.id} role={m.role} content={m.content} pending={m.pending} error={m.error} />
              ))}
            </ConversationContent>
          </Conversation>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-4 text-center overflow-auto">
          <Sparkles className="size-5 min-h-5 min-w-5 text-primary" />
          <p className="text-sm font-medium">Describe the UI you want to render</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Tell the AI what to build, then keep chatting to refine it. The latest version always shows up in the
            preview.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                disabled={isStreaming}
                className={cn(
                  "rounded-full border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t p-2">
        <div className="relative rounded-lg border bg-background transition-colors">
          <DefaultTextarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasMessages ? "Ask for a change…" : "Render a status card with latency and cost…"}
            minRows={2}
            maxRows={6}
            disabled={isStreaming}
            className="block w-full rounded-lg border-0 bg-transparent px-3 py-2 pr-11 text-sm focus:ring-0"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="absolute bottom-2 right-2 inline-flex size-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StopCircle className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!prompt.trim()}
              aria-label="Send message"
              className={cn(
                "absolute bottom-2 right-2 inline-flex size-7 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                prompt.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
}

const ChatBubble = ({ role, content, pending, error }: ChatBubbleProps) => {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground">
          {content}
        </div>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="flex justify-start">
        <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Sparkles className="size-3 shrink-0 text-muted-foreground" />
          <span className="shimmer duration-[2s]">Thinking…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "flex max-w-[85%] items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
          error
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "border-border bg-background text-foreground"
        )}
      >
        {!error && <Sparkles className="size-3 shrink-0 text-primary" />}
        <span className="whitespace-pre-wrap">{content}</span>
      </div>
    </div>
  );
};

export default AiPanel;
