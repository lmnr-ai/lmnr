"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ScreenshotToggleButtonProps {
  isActive: boolean;
  imageCount: number;
  activeImageIndex: number;
  progressDuration: number;
  onProgressComplete: () => void;
  onSegmentClick: (index: number) => void;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

interface ProgressSegmentProps {
  isSegmentActive: boolean;
  isSegmentCompleted: boolean;
  progress: number;
  onClick: () => void;
}

const ProgressSegment = ({ isSegmentActive, isSegmentCompleted, progress, onClick }: ProgressSegmentProps) => {
  const getFillWidth = () => {
    if (isSegmentCompleted) return 100;
    if (isSegmentActive) return progress;
    return 0;
  };

  return (
    <div
      className={cn("relative h-[2px] flex-1 cursor-pointer bg-landing-surface-500")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="absolute left-0 top-0 h-full bg-landing-primary-400" style={{ width: `${getFillWidth()}%` }} />
    </div>
  );
};

const ScreenshotToggleButton = ({
  isActive,
  imageCount,
  activeImageIndex,
  progressDuration,
  onProgressComplete,
  onSegmentClick,
  onClick,
  children,
  className,
}: ScreenshotToggleButtonProps) => {
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    // Reset on any change
    setProgress(0);
    startTimeRef.current = null;
    hasCompletedRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!isActive) return;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const newProgress = Math.min((elapsed / progressDuration) * 100, 100);

      setProgress(newProgress);

      if (newProgress >= 100) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onProgressComplete();
        }
        return;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isActive, activeImageIndex, progressDuration, onProgressComplete]);

  const segments = Array.from({ length: imageCount }, (_, i) => i);

  return (
    <div className={cn("flex flex-col gap-[2px] md:w-[140px]", "w-[65px]", className)}>
      <button
        className={cn(
          "font-sans font-normal md:text-sm tracking-[0.02em] leading-normal whitespace-nowrap",
          "cursor-pointer flex items-center justify-center md:px-5 md:py-1 rounded-sm",
          "transition-colors duration-500",
          "text-xs px-2 py-0.5",
          isActive
            ? "bg-landing-surface-700 text-landing-text-100"
            : "text-landing-text-300 hover:text-landing-text-100"
        )}
        onClick={onClick}
      >
        {children}
      </button>
      <div className="flex gap-1 w-full">
        {segments.map((i) => (
          <ProgressSegment
            key={i}
            isSegmentActive={isActive && i === activeImageIndex}
            isSegmentCompleted={isActive && i < activeImageIndex}
            progress={isActive && i === activeImageIndex ? progress : 0}
            onClick={() => onSegmentClick(i)}
          />
        ))}
      </div>
    </div>
  );
};

export default ScreenshotToggleButton;
