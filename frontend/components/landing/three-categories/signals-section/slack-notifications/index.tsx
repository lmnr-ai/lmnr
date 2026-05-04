"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import FixMock from "./fix-mock";
import GetContextMock from "./get-context-mock";
import SlackAlertMock from "./slack-alert-mock";

interface Props {
  className?: string;
}

type StepKey = "receive-alerts" | "get-context" | "fix";

const STEPS: { key: StepKey; label: string; subtitle: string }[] = [
  {
    key: "receive-alerts",
    label: "Receive alerts",
    subtitle: "Slack and email alerts about critical issues and weekly summaries of your Signal events.",
  },
  {
    key: "get-context",
    label: "Get context",
    subtitle: "See when, why, and how things went wrong. Quickly dive into related traces.",
  },
  {
    key: "fix",
    label: "Fix with confidence",
    subtitle: "Ship a fix based on the full picture, not a guess.",
  },
];

// scrollYProgress thresholds (0 = section's top hits viewport bottom, 1 = section's bottom hits viewport top)
const STEP_1_AT = 0.45;
const STEP_2_AT = 0.6;

const SlackNotifications = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const [stepIndex, setStepIndex] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const next = latest >= STEP_2_AT ? 2 : latest >= STEP_1_AT ? 1 : 0;
    setStepIndex((prev) => (prev === next ? prev : next));
  });

  // Master variable: 0 -> 1 across just the "Get context" section of the scroll.
  const getContextProgress = useTransform(scrollYProgress, [STEP_1_AT, STEP_2_AT], [0, 1], {
    clamp: true,
  });

  // Per-step fade: each step fades in over its first 5% (except step 1 which starts visible)
  // and fades out over its last 5% (except step 3 which stays visible). Single mock at any time.
  const wrapperOpacity = useTransform(scrollYProgress, (v) => {
    if (v < STEP_1_AT) {
      const internal = v / STEP_1_AT;
      return internal < 0.95 ? 1 : 1 - (internal - 0.95) / 0.05;
    }
    if (v < STEP_2_AT) {
      const internal = (v - STEP_1_AT) / (STEP_2_AT - STEP_1_AT);
      if (internal < 0.05) return internal / 0.05;
      if (internal > 0.95) return 1 - (internal - 0.95) / 0.05;
      return 1;
    }
    const internal = (v - STEP_2_AT) / (1 - STEP_2_AT);
    return internal < 0.05 ? internal / 0.05 : 1;
  });

  const activeKey = STEPS[stepIndex].key;

  return (
    <div
      ref={ref}
      className={cn(
        "bg-landing-surface-700 overflow-hidden relative rounded-lg w-full",
        "md:flex md:flex-row md:items-center md:gap-[60px] md:px-8 md:pt-8 md:pb-10 md:h-[450px]",
        "flex flex-col gap-8 p-5 h-[680px]",
        className
      )}
    >
      <div className={cn("shrink-0 z-10 flex flex-col items-start", "md:gap-10 md:w-[433px]", "gap-6 w-full")}>
        <p
          className={cn(
            "font-space-grotesk text-landing-text-100 w-full",
            "md:text-2xl md:leading-8",
            "text-xl leading-7"
          )}
        >
          Be notified when your
          <br />
          agent fails.
        </p>

        <div className={cn("flex flex-col items-start w-full", "md:gap-8", "gap-5")}>
          {STEPS.map((step, i) => {
            const isActive = i === stepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(i)}
                className="flex md:gap-5 gap-3 items-start cursor-pointer text-left"
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded border border-landing-surface-400 transition-colors shrink-0",
                    "md:size-8 size-7",
                    isActive ? "bg-landing-surface-500" : "bg-landing-surface-600"
                  )}
                >
                  <span
                    className={cn(
                      "font-sans transition-colors",
                      "md:text-base md:leading-5",
                      "text-sm leading-5",
                      isActive ? "text-landing-text-100" : "text-landing-text-300"
                    )}
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="flex flex-col gap-1 items-start justify-center min-w-0">
                  <p
                    className={cn(
                      "font-space-grotesk transition-colors whitespace-nowrap",
                      "md:text-xl md:leading-8",
                      "text-base leading-6",
                      isActive ? "text-landing-text-100" : "text-landing-text-300"
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      "font-sans text-landing-text-300",
                      "md:text-base md:leading-5 md:w-[381px]",
                      "text-sm leading-5"
                    )}
                  >
                    {step.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "flex items-center min-w-0",
          "md:flex-1 md:self-stretch md:justify-center",
          "w-full justify-start"
        )}
      >
        <motion.div style={{ opacity: wrapperOpacity }} className="md:w-[540px] w-[400px]">
          {activeKey === "receive-alerts" && <SlackAlertMock />}
          {activeKey === "get-context" && <GetContextMock progress={getContextProgress} />}
          {activeKey === "fix" && <FixMock />}
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 md:h-[73px] h-[60px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
    </div>
  );
};

export default SlackNotifications;
