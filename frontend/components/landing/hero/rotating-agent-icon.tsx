"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import ClaudeLogo from "./claude-logo";
import CodexLogo from "./codex-logo";
import CursorLogo from "./cursor-logo";

const AGENTS = [ClaudeLogo, CursorLogo, CodexLogo] as const;

export default function RotatingAgentIcon({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;

    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % AGENTS.length);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  const AgentIcon = AGENTS[index];

  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden text-foreground-200",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={index}
          className="absolute inset-0 inline-flex items-center justify-center"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <AgentIcon className="size-full" />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
