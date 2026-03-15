"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { useLaminarAgentStore } from "./store";

interface CollapsedFabProps {
  suggestions?: string[];
}

const BANNER_SHOW_INTERVAL = 30_000; // 30 seconds between banners
const BANNER_DISPLAY_DURATION = 6_000; // Show banner for 6 seconds

export default function CollapsedFab({ suggestions = [] }: CollapsedFabProps) {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const suggestionIndexRef = useRef(0);

  const showBanner = useCallback(() => {
    if (suggestions.length === 0) return;
    const text = suggestions[suggestionIndexRef.current % suggestions.length];
    suggestionIndexRef.current += 1;
    setBannerText(text);
    setTimeout(() => setBannerText(null), BANNER_DISPLAY_DURATION);
  }, [suggestions]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    // Show first banner after a delay
    const initialTimeout = setTimeout(showBanner, BANNER_SHOW_INTERVAL);
    const interval = setInterval(showBanner, BANNER_SHOW_INTERVAL + BANNER_DISPLAY_DURATION);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
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
          <motion.button
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={handleBannerClick}
            className="bg-background border rounded-lg shadow-lg px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-muted/40 transition-colors max-w-[240px] text-left cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary flex-none" />
              <span className="line-clamp-2">{bannerText}</span>
            </span>
          </motion.button>
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
