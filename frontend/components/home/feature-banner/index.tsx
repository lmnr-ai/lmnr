"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { features } from "./banner-data";
import BannerNav from "./banner-nav";
import BannerSlide from "./banner-slide";

export default function FeatureBanner() {
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % features.length);
    }, 5000);
  }, []);

  useEffect(() => {
    resetTimer();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [resetTimer]);

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + features.length) % features.length);
    resetTimer();
  }, [resetTimer]);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % features.length);
    resetTimer();
  }, [resetTimer]);

  const handleSelect = useCallback(
    (index: number) => {
      setActiveIndex(index);
      resetTimer();
    },
    [resetTimer]
  );

  return (
    <div className="flex gap-2 items-start w-full">
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ scale: 0.98 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.98 }}
            transition={{ duration: 0.1, ease: "easeInOut" }}
          >
            <BannerSlide feature={features[activeIndex]} />
          </motion.div>
        </AnimatePresence>
      </div>
      <BannerNav
        activeIndex={activeIndex}
        totalSlides={features.length}
        onPrev={handlePrev}
        onNext={handleNext}
        onSelect={handleSelect}
      />
    </div>
  );
}
