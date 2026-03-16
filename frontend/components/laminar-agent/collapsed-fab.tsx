"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { useLaminarAgentStore } from "./store";

interface CollapsedFabProps {
  suggestions?: string[];
}

const BANNER_SHOW_INTERVAL = 20_000; // 20 seconds between banners
const BANNER_DISPLAY_DURATION = 8_000; // Show banner for 8 seconds
const CONTEXT_CHANGE_DELAY = 500; // Show banner 500ms after context change

export default function CollapsedFab({ suggestions = [] }: CollapsedFabProps) {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const suggestionIndexRef = useRef(0);
  const prevSuggestionsRef = useRef<string[]>(suggestions);

  const showBanner = useCallback(() => {
    if (suggestions.length === 0) return;
    const text = suggestions[suggestionIndexRef.current % suggestions.length];
    suggestionIndexRef.current += 1;
    setBannerText(text);
    setTimeout(() => setBannerText(null), BANNER_DISPLAY_DURATION);
  }, [suggestions]);

  // Show banner immediately when suggestions change (context change)
  useEffect(() => {
    const prev = prevSuggestionsRef.current;
    prevSuggestionsRef.current = suggestions;

    if (suggestions.length === 0) return;

    const changed = prev.length !== suggestions.length || prev.some((s, i) => s !== suggestions[i]);
    if (changed) {
      suggestionIndexRef.current = 0;
      const timeout = setTimeout(showBanner, CONTEXT_CHANGE_DELAY);
      return () => clearTimeout(timeout);
    }
  }, [suggestions, showBanner]);

  // Show first banner quickly on mount, then regular interval
  const hasShownInitialRef = useRef(false);
  useEffect(() => {
    if (suggestions.length === 0) return;
    if (!hasShownInitialRef.current) {
      hasShownInitialRef.current = true;
      const initial = setTimeout(showBanner, 3_000);
      return () => clearTimeout(initial);
    }
    const interval = setInterval(showBanner, BANNER_SHOW_INTERVAL + BANNER_DISPLAY_DURATION);
    return () => clearInterval(interval);
  }, [showBanner, suggestions.length]);

  const handleBannerClick = () => {
    setBannerText(null);
    setViewMode("floating");
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="fixed bottom-6 right-6 z-50 flex items-end gap-2"
    >
      <AnimatePresence>
        {bannerText && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="border border-primary bg-background rounded-lg shadow-lg px-3 py-2 text-xs text-primary max-w-[280px] text-left flex items-start gap-1"
          >
            <button
              onClick={handleBannerClick}
              className="flex items-center gap-1.5 hover:text-primary/80 transition-colors cursor-pointer flex-1 min-w-0"
            >
              <Sparkles className="w-3 h-3 text-primary flex-none" />
              <span className="line-clamp-2 font-medium">{bannerText}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBannerText(null);
              }}
              className="flex-none p-0.5 rounded hover:bg-muted/60 transition-colors cursor-pointer"
              aria-label="Dismiss suggestion"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <Button
        size="icon"
        className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-shadow flex-none"
        onClick={() => setViewMode("floating")}
        aria-label="Open Laminar Agent"
      >
        <Sparkles className="w-5 h-5" />
      </Button>
    </motion.div>
  );
}
