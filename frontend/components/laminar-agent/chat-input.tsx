"use client";

import { motion } from "framer-motion";
import { ArrowUp, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isDisabled: boolean;
  contextualSuggestion?: string;
  onSuggestionClick?: (suggestion: string) => void;
}

export default function ChatInput({
  input,
  onInputChange,
  onSend,
  isDisabled,
  contextualSuggestion,
  onSuggestionClick,
}: ChatInputProps) {
  const handleSubmit = () => {
    if (input.trim()) {
      onSend();
    }
  };

  return (
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
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ask Laminar Agent anything..."
              className="bg-transparent border-none focus-visible:ring-0 resize-none w-full"
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              className={cn(
                "absolute right-1 bottom-2 h-7 w-7 rounded-full border",
                input.trim() === "" || isDisabled
                  ? "bg-muted text-muted-foreground opacity-50"
                  : "bg-primary text-primary-foreground"
              )}
              variant="ghost"
              disabled={input.trim() === "" || isDisabled}
              aria-label="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </motion.div>
      {contextualSuggestion && onSuggestionClick && (
        <button
          onClick={() => onSuggestionClick(contextualSuggestion)}
          className="flex items-center gap-1.5 mt-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/40 w-fit"
        >
          <Sparkles className="w-3 h-3" />
          <span>{contextualSuggestion}</span>
        </button>
      )}
    </div>
  );
}
