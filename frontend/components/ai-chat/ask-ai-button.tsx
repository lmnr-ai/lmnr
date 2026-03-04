"use client";

import { Sparkles } from "lucide-react";

import { useAIChatStore } from "@/lib/ai-chat/store";
import { cn } from "@/lib/utils";

export default function AskAIButton() {
  const { isOpen, toggle } = useAIChatStore((state) => ({
    isOpen: state.isOpen,
    toggle: state.toggle,
  }));

  if (isOpen) return null;

  return (
    <button
      onClick={toggle}
      className={cn(
        "fixed bottom-5 right-5 z-50",
        "h-10 w-10 rounded-full",
        "bg-primary text-primary-foreground",
        "flex items-center justify-center",
        "shadow-lg hover:shadow-xl",
        "transition-all duration-200",
        "hover:scale-110 active:scale-95"
      )}
      aria-label="Ask AI"
    >
      <Sparkles className="w-5 h-5" />
    </button>
  );
}
