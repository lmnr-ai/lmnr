"use client";

import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import SignalsMockUI from "./signals-mock-ui";
import { type SignalTabKey } from "./signals-mock-ui/mock-data";
import SlackNotifications from "./slack-notifications";

interface Props {
  className?: string;
}

type TabKey = SignalTabKey | "anything";

const ANYTHING_PROMPT = "Track literally anything you're looking for, in plain English";

const MOBILE_IMAGE_BY_TAB: Record<SignalTabKey, string> = {
  "detect-failures": "/assets/landing/signals-mock-detect-failures.png",
  "identify-user-friction": "/assets/landing/signals-mock-identify-user-friction.png",
  "monitor-safety": "/assets/landing/signals-mock-monitor-safety.png",
};

const TABS: { key: TabKey; label: string; quote: string }[] = [
  {
    key: "detect-failures",
    label: "Detect failures",
    quote:
      "Analyze this trace for concrete issues: tool call failures, API errors, loops or repeated calls, wrong tool selection, logic errors, and abnormally slow or expensive spans.",
  },
  {
    key: "identify-user-friction",
    label: "Identify user friction",
    quote:
      "Analyze this session for signs of user frustration or friction. Look for confusion, repeated attempts, or poor user experience.",
  },
  {
    key: "monitor-safety",
    label: "Monitor safety",
    quote:
      "Check if the agent did anything potentially unsafe, inappropriate, or outside its intended scope. Include policy violations and risky actions.",
  },
  {
    key: "anything",
    label: "Anything",
    quote: "",
  },
];

const DESCRIPTION_LINES = [
  "Signals agent automatically Analyzes your traces,",
  "Detects events based on your prompt,",
  "& Creates clusters in an organized hierarchy",
];

const SignalsSection = ({ className }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>("detect-failures");
  const [promptValue, setPromptValue] = useState(TABS[0].quote);
  const [scrollSelection, setScrollSelection] = useState<0 | 1 | 2>(0);
  const [hoverSelection, setHoverSelection] = useState<0 | 1 | 2 | null>(null);
  const selection = hoverSelection ?? scrollSelection;

  const mockTabKey: SignalTabKey = activeTab === "anything" ? "detect-failures" : activeTab;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ["start end", "end start"],
  });
  const screenshotX = useSpring(useTransform(scrollYProgress, [0, 0.5, 1], [80, 40, 0]));
  const screenshotOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.5, 0.8, 1]);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next: 0 | 1 | 2 = v < 0.45 ? 0 : v < 0.55 ? 1 : 2;
    setScrollSelection(next);
  });

  const handleTabClick = useCallback((tab: (typeof TABS)[number]) => {
    setActiveTab(tab.key);
    setPromptValue(tab.quote);
  }, []);

  return (
    <div className={cn("flex flex-col md:gap-[54px] items-start w-full", "gap-8", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>Signals answer any question, from any trace, at scale</h2>
        <p className={bodyLarge}>
          Describe a Signal you&apos;re looking for, Laminar extracts it from past and future traces.
        </p>
      </div>

      <div className={cn("flex flex-col items-center w-full", "md:gap-8 gap-4")}>
        {/* Tabs */}
        <div className="grid md:grid-cols-4 grid-cols-2 md:gap-3 gap-2 items-stretch w-full">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabClick(tab)}
                className={cn(
                  "flex-1 min-w-0 flex items-center justify-center md:py-2 py-2 px-2 rounded transition-colors text-center leading-tight",
                  "font-sans md:text-base text-xs text-landing-text-100 md:whitespace-nowrap md:truncate",
                  isActive
                    ? "bg-landing-surface-600 border border-landing-surface-500"
                    : "bg-landing-surface-700 hover:bg-landing-surface-600/50"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Desktop card — interactive mock UI */}
        <div
          ref={cardRef}
          className="hidden md:flex bg-landing-surface-700 md:gap-[20px] md:h-[671px] items-start overflow-hidden rounded w-full relative md:flex-row md:pl-9 md:pt-7 md:pb-8"
        >
          <div className="absolute left-0 bottom-0 w-full bg-gradient-to-t from-landing-surface-700 to-transparent h-[140px] z-10" />
          <div className="flex flex-col font-normal md:h-full items-start justify-start shrink-0 md:w-[340px] w-full md:gap-4 gap-6 z-20">
            <div className="flex flex-col gap-1 items-start w-full h-[280px] ">
              <p className="font-sans text-base leading-5 text-landing-text-300">Prompt</p>
              <p className="font-space-grotesk md:text-2xl md:leading-8 text-lg leading-7 text-landing-text-100 w-full">
                {activeTab === "anything" ? (
                  <>
                    <span
                      className="inline-block w-[2px] h-[1em] bg-landing-primary-400 align-middle"
                      style={{ animation: "landing-caret-blink 1s step-end infinite" }}
                    />
                    <span className="text-landing-text-400">{ANYTHING_PROMPT}</span>
                  </>
                ) : (
                  promptValue
                )}
              </p>
            </div>
            <div className="flex flex-col gap-6 items-start w-full">
              {DESCRIPTION_LINES.map((line, i) => {
                const idx = i as 0 | 1 | 2;
                return (
                  <p
                    key={i}
                    onMouseEnter={() => setHoverSelection(idx)}
                    onMouseLeave={() => setHoverSelection((prev) => (prev === idx ? null : prev))}
                    className={cn(
                      "font-space-grotesk text-xl leading-6 w-full transition-colors cursor-default",
                      idx === selection ? "text-landing-text-100" : "text-landing-text-300"
                    )}
                  >
                    {line}
                  </p>
                );
              })}
            </div>
          </div>
          <motion.div
            style={{ x: screenshotX, opacity: screenshotOpacity }}
            className="relative flex-1 w-full md:w-auto md:min-w-0 md:h-[800px]"
          >
            <SignalsMockUI
              key={mockTabKey}
              tabKey={mockTabKey}
              className="h-full"
              clustersHighlighted={selection === 2}
              eventsHighlighted={selection === 1}
              eventsTextHighlighted={selection === 0}
            />
          </motion.div>
        </div>

        {/* Mobile layout — single card with quote, Events/Clusters labels, and mock UI image */}
        <div className="md:hidden bg-landing-surface-700 rounded overflow-hidden relative w-full h-[720px] px-4 py-3">
          <div className="flex flex-col gap-12 h-full items-start">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-1 items-start w-full shrink-0 h-[150px]">
                <p className="font-sans text-xs leading-4 text-landing-text-300">Prompt</p>
                <p className="font-space-grotesk text-lg leading-6 text-landing-text-100 w-full">
                  {activeTab === "anything" ? (
                    <>
                      <span
                        className="inline-block w-[2px] h-[0.9em] bg-landing-primary-400 align-middle"
                        style={{ animation: "landing-caret-blink 1s step-end infinite" }}
                      />
                      <span className="text-landing-text-400">{ANYTHING_PROMPT}</span>
                    </>
                  ) : (
                    promptValue
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-6 w-[260px]">
                <p className={cn("font-space-grotesk text-base leading-5 w-full text-landing-text-300")}>
                  Signals agent automatically Analyzes your traces, Detects events based on your prompt, & Creates
                  clusters in an organized hierarchy
                </p>
              </div>
            </div>
            <div className="relative shrink-0 w-[474px] h-[479px]">
              <Image
                src={MOBILE_IMAGE_BY_TAB[mockTabKey]}
                alt={`Signals UI — ${mockTabKey}`}
                fill
                sizes="474px"
                className="object-cover"
                priority
              />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[122px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
        </div>

        <SlackNotifications />
      </div>

      <DocsButton href="https://laminar.sh/docs/signals#signals" />
    </div>
  );
};

export default SignalsSection;
