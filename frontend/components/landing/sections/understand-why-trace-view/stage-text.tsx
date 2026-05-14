"use client";

import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { bodyMedium } from "../../class-names";

export type Stage = 1 | 2 | 3 | 4;

interface Props {
  stage: Stage;
  className?: string;
}

const TEXTS: Record<Stage, string> = {
  1: "A clear, concise view of your agent run",
  2: "with a timeline,",
  3: "and a screen recording of your agent's browser.",
  4: "Have a long, complex agent run? Chat with AI about it",
};

// Stage description text. Crossfades between stages — each stage's text is
// rendered as an absolutely-positioned paragraph so changing the text doesn't
// reflow the column layout below.
const StageText = ({ stage, className }: Props) => (
  <div className={cn("relative w-full max-w-[760px] h-[24px]", className)}>
    <AnimatePresence mode="wait">
      <motion.p
        key={stage}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn(bodyMedium, "absolute inset-0 flex items-center justify-center")}
      >
        {TEXTS[stage]}
      </motion.p>
    </AnimatePresence>
  </div>
);

export default StageText;
