"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LaminarIcon } from "@/components/ui/icons";

import { useLaminarAgentStore } from "./store";
import { getSuggestionsForRoute } from "./suggestions";

const SUGGESTION_CYCLE_INTERVAL = 5000;

function SuggestionCycler({
  suggestions,
  onSuggestionClick,
}: {
  suggestions: { display: string; prompt: string }[];
  onSuggestionClick: (prompt: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Cycle through suggestions on interval
  useEffect(() => {
    if (suggestions.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % suggestions.length);
    }, SUGGESTION_CYCLE_INTERVAL);

    return () => clearInterval(interval);
  }, [suggestions]);

  const currentSuggestion = suggestions[currentIndex];

  if (!currentSuggestion) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.button
        key={currentIndex}
        initial={{ opacity: 0, x: 10, width: 0 }}
        animate={{ opacity: 1, x: 0, width: "auto" }}
        exit={{ opacity: 0, x: 10, width: 0 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => {
          e.stopPropagation();
          onSuggestionClick(currentSuggestion.prompt);
        }}
        className="bg-primary text-primary-foreground text-sm px-3 py-2 rounded-full shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap overflow-hidden cursor-pointer"
      >
        {currentSuggestion.display}
      </motion.button>
    </AnimatePresence>
  );
}

export default function CollapsedButton() {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const setPrefillInput = useLaminarAgentStore((s) => s.setPrefillInput);
  const pathname = usePathname();

  const suggestions = useMemo(() => getSuggestionsForRoute(pathname), [pathname]);

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
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
      {suggestions.length > 0 && (
        <SuggestionCycler key={pathname} suggestions={suggestions} onSuggestionClick={handleSuggestionClick} />
      )}
      <button
        onClick={() => setViewMode("floating")}
        className="flex items-center justify-center size-12 rounded-full bg-primary shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex-shrink-0"
        aria-label="Open Laminar Agent"
      >
        <LaminarIcon className="size-6" fill="hsl(var(--primary-foreground))" />
      </button>
    </div>
  );
}
