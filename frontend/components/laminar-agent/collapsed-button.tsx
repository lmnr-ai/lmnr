"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLaminarAgentStore } from "./store";
import { contextSuggestions, defaultSuggestions } from "./suggestions";

const SUGGESTION_CYCLE_INTERVAL = 5000;

function SuggestionCycler({
  suggestions,
  onSuggestionClick,
}: {
  suggestions: { display: string; prompt: string }[];
  onSuggestionClick: (prompt: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle through suggestions on interval, pausing on hover
  useEffect(() => {
    if (suggestions.length <= 1) return;
    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % suggestions.length);
    }, SUGGESTION_CYCLE_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [suggestions, isPaused]);

  const currentSuggestion = suggestions[currentIndex];

  if (!currentSuggestion) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.button
        key={currentIndex}
        initial={{ opacity: 0, x: 10, width: 0 }}
        animate={{ opacity: 1, x: 0, width: "auto" }}
        exit={{ opacity: 0, x: -10, width: 0 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => {
          e.stopPropagation();
          onSuggestionClick(currentSuggestion.prompt);
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="bg-primary text-primary-foreground text-sm px-3 py-2 rounded-full shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap overflow-hidden cursor-pointer max-w-[200px]"
      >
        <span className="truncate block">{currentSuggestion.display}</span>
      </motion.button>
    </AnimatePresence>
  );
}

export default function CollapsedButton() {
  const { viewMode, activeContext, setViewMode, setPrefillInput } = useLaminarAgentStore((s) => ({
    viewMode: s.viewMode,
    activeContext: s.activeContext,
    setViewMode: s.setViewMode,
    setPrefillInput: s.setPrefillInput,
  }));

  const suggestions = useMemo(
    () => (activeContext ? contextSuggestions[activeContext] : undefined) ?? defaultSuggestions,
    [activeContext]
  );

  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      setPrefillInput(prompt);
      setViewMode("floating");
    },
    [setPrefillInput, setViewMode]
  );

  if (viewMode !== "collapsed") {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[55] flex items-center gap-2">
      {suggestions.length > 0 && (
        <SuggestionCycler suggestions={suggestions} onSuggestionClick={handleSuggestionClick} />
      )}
      <button
        onClick={() => setViewMode("floating")}
        className="flex items-center justify-center size-12 rounded-full bg-primary shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex-shrink-0"
        aria-label="Open Laminar Agent"
      >
        <Sparkles className="size-5 text-primary-foreground" />
      </button>
    </div>
  );
}
