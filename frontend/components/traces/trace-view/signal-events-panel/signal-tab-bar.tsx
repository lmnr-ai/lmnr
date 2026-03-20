"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

interface HoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface SignalTab {
  id: string;
  name: string;
}

interface SignalTabBarProps {
  tabs: SignalTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
}

function TabButton({ tab, isActive, onClick }: { tab: SignalTab; isActive: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<HoverRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    },
    []
  );

  const handleMouseEnter = useCallback(() => {
    clearLeaveTimeout();
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setHovered(true);
    }
  }, [clearLeaveTimeout]);

  const scheduleClose = useCallback(() => {
    clearLeaveTimeout();
    leaveTimeoutRef.current = setTimeout(() => {
      setHovered(false);
      setRect(null);
    }, 80);
  }, [clearLeaveTimeout]);

  // Check if the name is truncated
  const isTruncated = tab.name.length > 14;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleClose}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap border-b-2 py-1 transition-all text-sm font-medium max-w-[120px] truncate",
          isActive
            ? "border-secondary-foreground text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        {tab.name}
      </button>

      {isTruncated &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {hovered && rect && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15, delay: 0.5 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="fixed z-50 pointer-events-none"
                style={{
                  top: rect.top,
                  left: rect.left,
                }}
              >
                <div className="bg-muted outline -outline-offset-1 outline-border shadow-md shadow-background/80 rounded px-2 py-1 text-sm font-medium whitespace-nowrap">
                  {tab.name}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

export default function SignalTabBar({ tabs, activeTabId, onTabSelect }: SignalTabBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 border-b overflow-x-auto">
      {tabs.map((tab) => (
        <TabButton key={tab.id} tab={tab} isActive={activeTabId === tab.id} onClick={() => onTabSelect(tab.id)} />
      ))}
    </div>
  );
}
