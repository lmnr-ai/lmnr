"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { useLaminarAgentStore } from "./store";
import { contextSuggestions, defaultSuggestions } from "./suggestions";

const INITIAL_DELAY = 4000;
const SUGGESTION_CYCLE_INTERVAL = 5000;

function SuggestionSpan({
  suggestions,
  onSuggestionClick,
  onVisibilityChange,
}: {
  suggestions: { display: string; prompt: string }[];
  onSuggestionClick: (prompt: string) => void;
  onVisibilityChange: (visible: boolean) => void;
}) {
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initialDelayRef.current = setTimeout(() => {
      setShowSuggestion(true);
    }, INITIAL_DELAY);

    return () => {
      if (initialDelayRef.current) {
        clearTimeout(initialDelayRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showSuggestion || suggestions.length <= 1) return;
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
  }, [suggestions, isPaused, showSuggestion]);

  const currentSuggestion = showSuggestion ? suggestions[currentIndex] : null;

  useEffect(() => {
    onVisibilityChange(currentSuggestion !== null);
  }, [currentSuggestion, onVisibilityChange]);

  if (!currentSuggestion) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSuggestionClick(currentSuggestion.prompt);
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="text-xs leading-4 text-primary-foreground whitespace-nowrap shrink-0 max-w-[200px] overflow-hidden cursor-pointer"
      aria-label={currentSuggestion.display}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={currentIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="block truncate"
        >
          {currentSuggestion.display}
        </motion.span>
      </AnimatePresence>
    </button>
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

  const pathname = usePathname();
  const [hasSuggestion, setHasSuggestion] = useState(false);

  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      setPrefillInput(prompt);
      setViewMode("floating");
    },
    [setPrefillInput, setViewMode]
  );

  const handleOpenAgent = useCallback(() => {
    setViewMode("floating");
  }, [setViewMode]);

  const handleVisibilityChange = useCallback((visible: boolean) => {
    setHasSuggestion(visible);
  }, []);

  if (viewMode !== "collapsed") {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[55] flex items-center">
      <motion.div
        initial={false}
        animate={{
          paddingLeft: hasSuggestion ? 16 : 2,
        }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3 border border-primary rounded-full py-[2px] pr-[2px] shadow-lg hover:shadow-xl hover:scale-[1.04] active:scale-[0.98] transition-all cursor-pointer bg-muted duration-200"
      >
        <SuggestionSpan
          key={pathname}
          suggestions={suggestions}
          onSuggestionClick={handleSuggestionClick}
          onVisibilityChange={handleVisibilityChange}
        />
        <div className="size-[36px] shrink-0 flex justify-center items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenAgent();
            }}
            className={cn(
              "bg-primary rounded-[500px] flex justify-center items-center hover:size-[48px] hover:shadow-xl hover:border hover:border-primary-foreground/50 transition-all duration-200 cursor-pointer shrink-0",
              hasSuggestion ? "size-full" : "size-[48px]"
            )}
            aria-label="Open Laminar Agent"
          >
            <Sparkles className={cn("transition-all duration-200", hasSuggestion ? "size-[16px]" : "size-[24px]")} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
