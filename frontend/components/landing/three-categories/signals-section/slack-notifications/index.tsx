"use client";

import { AnimatePresence, motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import FixMock from "./fix-mock";
import GetContextMock from "./get-context-mock";
import SlackAlertMock from "./slack-alert-mock";

interface Props {
  className?: string;
}

type StepKey = "receive-alerts" | "get-context" | "fix";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "receive-alerts", label: "Receive alerts" },
  { key: "get-context", label: "Get context" },
  { key: "fix", label: "Fix" },
];

const ROTATE_MS = 4000;

const SlackNotifications = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0.3 });
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const id = setTimeout(() => setStepIndex((i) => (i + 1) % STEPS.length), ROTATE_MS);
    return () => clearTimeout(id);
  }, [stepIndex, isInView]);

  const activeKey = STEPS[stepIndex].key;

  return (
    <div
      ref={ref}
      className={cn(
        "bg-landing-surface-700 overflow-hidden relative rounded-lg w-full",
        "md:h-[223px] md:flex md:flex-row md:items-stretch md:gap-[30px] md:pl-8 md:pr-14",
        "flex flex-col gap-5 p-5 h-[321px]",
        className
      )}
    >
      {/* Left column: title + stepper */}
      <div
        className={cn(
          "shrink-0 z-10",
          "md:flex md:flex-col md:flex-1 md:min-w-0 md:justify-between md:py-8",
          "flex flex-col gap-5 w-full"
        )}
      >
        <div className="flex flex-col gap-1 items-start md:w-[381px] w-full">
          <p className="font-space-grotesk md:text-2xl md:leading-8 text-xl text-landing-text-100 w-full">
            Slack and email alerts
          </p>
          <p className="font-sans md:text-base text-sm text-landing-text-300 leading-5 w-full">
            Receive alerts about critical issues and weekly summaries of your Signal events.
          </p>
        </div>

        <div className="flex md:flex-row md:gap-8 flex-col gap-3 items-start">
          {STEPS.map((step, i) => {
            const isActive = i === stepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(i)}
                className="flex md:gap-4 gap-3 items-center cursor-pointer"
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded border border-landing-surface-400 transition-colors",
                    "md:size-8 size-5",
                    isActive ? "bg-landing-surface-500" : "bg-landing-surface-600"
                  )}
                >
                  <span
                    className={cn(
                      "font-sans md:text-base text-xs md:leading-5 leading-4",
                      isActive ? "text-landing-text-100" : "text-landing-text-300"
                    )}
                  >
                    {i + 1}
                  </span>
                </div>
                <span
                  className={cn(
                    "font-space-grotesk md:text-2xl md:leading-8 text-sm leading-5 whitespace-nowrap transition-colors",
                    isActive ? "text-landing-text-100" : "text-landing-text-300"
                  )}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right mock — top-anchored, overflows past container bottom on desktop & mobile */}
      <div className={cn("md:w-[494px] md:shrink-0 md:self-start md:mt-[48.5px]", "w-full")}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full"
          >
            {activeKey === "receive-alerts" && <SlackAlertMock />}
            {activeKey === "get-context" && <GetContextMock />}
            {activeKey === "fix" && <FixMock />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom gradient — fades the overflowed mock */}
      <div className="absolute bottom-0 left-0 right-0 md:h-[73px] h-[60px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
    </div>
  );
};

export default SlackNotifications;
