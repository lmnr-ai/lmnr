"use client";

import { MessageCircleQuestion } from "lucide-react";

import { useLaminarAgentStore } from "./store";

const EXAMPLE_QUESTIONS = [
  "How many traces did I receive today?",
  "Show me my most used models",
  "What is my average latency?",
  "Are there any recent failed traces?",
];

interface EmptyStateProps {
  onSuggestionClick: (question: string) => void;
}

export default function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const isPanel = viewMode === "sidebar" || viewMode === "floating";

  return (
    <div className={`flex flex-col items-center h-full px-4 pb-4 ${isPanel ? "justify-center" : "justify-end"}`}>
      <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
        Ask questions about your project — traces, evaluations, metrics, and more.
      </p>
      <div className="w-full max-w-md space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircleQuestion className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Try asking</span>
        </div>
        {EXAMPLE_QUESTIONS.map((question, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(question)}
            className="w-full text-left px-3 py-2 text-sm rounded-md border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-border transition-colors text-foreground/80 hover:text-foreground"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
