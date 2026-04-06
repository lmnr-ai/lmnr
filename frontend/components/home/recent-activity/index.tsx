"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import ActivityCard from "./activity-card";
import { type ActivityNotification, dummyNotifications } from "./dummy-data";

const gradientTransition = { type: "spring" as const, stiffness: 500, damping: 20 };

export default function RecentActivity() {
  const [notifications, setNotifications] = useState<ActivityNotification[]>(dummyNotifications);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateGradients = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftGradient(el.scrollLeft > 0);
    setShowRightGradient(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateGradients();
  }, [notifications, updateGradients]);

  const handleDismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setExpandedId((prev) => (prev === id ? null : prev));
  }, []);

  const handleClearAll = useCallback(() => {
    setNotifications([]);
    setExpandedId(null);
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 items-start w-full">
      <div className="flex items-center justify-between w-full text-xs text-secondary-foreground">
        <p>Recent Activity ({notifications.length})</p>
        <button onClick={handleClearAll} className="hover:text-foreground transition-colors">
          Clear all
        </button>
      </div>
      <div className="relative w-full">
        <div ref={scrollRef} onScroll={updateGradients} className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
          {notifications.map((notification) => (
            <ActivityCard
              key={notification.id}
              notification={notification}
              onDismiss={handleDismiss}
              isExpanded={expandedId === notification.id}
              onToggleExpand={() => handleToggleExpand(notification.id)}
            />
          ))}
        </div>
        <AnimatePresence>
          {showLeftGradient && (
            <motion.div
              key="left-gradient"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={gradientTransition}
              className="absolute left-0 top-0 bottom-0 w-[134px] bg-gradient-to-r from-background to-transparent pointer-events-none"
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showRightGradient && (
            <motion.div
              key="right-gradient"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={gradientTransition}
              className="absolute right-0 top-0 bottom-0 w-[134px] bg-gradient-to-l from-background to-transparent pointer-events-none"
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
