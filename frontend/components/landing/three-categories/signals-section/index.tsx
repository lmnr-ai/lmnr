"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import SignalsMockUI from "./signals-mock-ui";
import SlackAlertPreview from "./slack-alert-preview";

interface Props {
  className?: string;
}

type TabKey = "detect-failures" | "identify-user-friction" | "monitor-safety";

const MOBILE_IMAGE_BY_TAB: Record<TabKey, string> = {
  "detect-failures": "/assets/landing/signals-mock-detect-failures.png",
  "identify-user-friction": "/assets/landing/signals-mock-identify-user-friction.png",
  "monitor-safety": "/assets/landing/signals-mock-monitor-safety.png",
};

const TABS: { key: TabKey; label: string; quote: string }[] = [
  {
    key: "detect-failures",
    label: "Detect failures",
    quote:
      "“Analyze this trace for concrete issues: tool call failures, API errors, loops or repeated calls, and abnormally slow or expensive spans.”",
  },
  {
    key: "identify-user-friction",
    label: "User friction",
    quote:
      "“Analyze this session for signs of user frustration or friction. Look for confusion, repeated attempts, or poor user experience.”",
  },
  {
    key: "monitor-safety",
    label: "Monitor safety",
    quote:
      "“Check if the agent did anything potentially unsafe, inappropriate, or outside its intended scope. Include policy violations and risky actions.”",
  },
];

const SignalsSection = ({ className }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>("detect-failures");
  const [clustersHighlighted, setClustersHighlighted] = useState(false);
  const [eventsHighlighted, setEventsHighlighted] = useState(false);
  const activeQuote = TABS.find((t) => t.key === activeTab)?.quote ?? TABS[0].quote;

  const screenshotRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: screenshotRef,
    offset: ["start end", "end start"],
  });
  const screenshotX = useSpring(useTransform(scrollYProgress, [0, 0.5, 1], [80, 40, 0]));
  const screenshotOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.5, 0.8, 1]);

  return (
    <div className={cn("flex flex-col md:gap-[54px] items-start w-full", "gap-8", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>Signals answer any question, from any trace, at scale</h2>
        <p className={bodyLarge}>
          Describe a Signal you&apos;re looking for, Laminar extracts it from past and future traces.
        </p>
      </div>

      <div className={cn("flex flex-col items-center w-full", "md:gap-8 gap-4")}>
        {/* Tabs (multiselect) */}
        <div className="flex md:gap-3 gap-2 items-stretch w-full">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
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
        <div className="hidden md:flex bg-landing-surface-700 md:gap-[20px] md:h-[671px] items-start overflow-hidden rounded w-full relative md:flex-row md:pl-9 md:pt-7 md:pb-8">
          <div className="absolute left-0 bottom-0 w-full bg-gradient-to-t from-landing-surface-700 to-transparent h-[140px] z-10" />
          <div className="flex flex-col font-normal md:h-full items-start justify-start shrink-0 md:w-[340px] w-full md:gap-10 gap-6 z-20">
            <p className="font-space-grotesk md:text-2xl md:leading-8 text-lg leading-7 text-landing-text-100 w-full md:h-[200px]">
              {activeQuote}
            </p>
            <div className="flex flex-col md:gap-6 gap-4 items-start w-full">
              <div
                className="flex flex-col gap-1 items-start w-full"
                onMouseEnter={() => setEventsHighlighted(true)}
                onMouseLeave={() => setEventsHighlighted(false)}
              >
                <p className="font-space-grotesk md:text-2xl md:leading-8 text-xl text-landing-text-100 w-full">
                  Events
                </p>
                <p className="font-sans md:text-base text-sm text-landing-text-300 leading-5 w-full">
                  Signals agent detects events from your traces based on your definition.
                </p>
              </div>
              <div
                className="flex flex-col gap-1 items-start w-full"
                onMouseEnter={() => setClustersHighlighted(true)}
                onMouseLeave={() => setClustersHighlighted(false)}
              >
                <p className="font-space-grotesk md:text-2xl md:leading-8 text-xl text-landing-text-100 w-full">
                  Clusters
                </p>
                <p className="font-sans md:text-base text-sm text-landing-text-300 leading-5 w-full">
                  All events are automatically clustered for high-level insights.
                </p>
              </div>
            </div>
          </div>
          <motion.div
            ref={screenshotRef}
            style={{ x: screenshotX, opacity: screenshotOpacity }}
            className="relative flex-1 w-full md:w-auto md:min-w-0 md:h-[800px]"
          >
            <SignalsMockUI
              key={activeTab}
              tabKey={activeTab}
              className="h-full"
              clustersHighlighted={clustersHighlighted}
              eventsHighlighted={eventsHighlighted}
            />
          </motion.div>
        </div>

        {/* Mobile layout — single card with quote, Events/Clusters labels, and mock UI image */}
        <div className="md:hidden bg-landing-surface-700 rounded overflow-hidden relative w-full h-[549px] px-4 py-3">
          <div className="flex flex-col gap-5 h-full items-start">
            <p className="font-sans text-sm leading-5 text-landing-text-100 w-full h-[100px]">{activeQuote}</p>
            <div className="flex gap-3 items-start w-full">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className="font-space-grotesk text-sm leading-5 text-landing-text-100 w-full">Events</p>
                <p className="font-sans text-[10px] leading-[14px] text-landing-text-300 w-full">
                  Signals agent detects events from your traces based on your definition.
                </p>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className="font-space-grotesk text-sm leading-5 text-landing-text-100 w-full">Clusters</p>
                <p className="font-sans text-[10px] leading-[14px] text-landing-text-300 w-full">
                  All events are automatically clustered for high-level insights.
                </p>
              </div>
            </div>
            <div className="relative shrink-0 w-[474px] h-[479px]">
              <Image
                src={MOBILE_IMAGE_BY_TAB[activeTab]}
                alt={`Signals UI — ${activeTab}`}
                fill
                sizes="474px"
                className="object-cover"
                priority
              />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[122px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
        </div>

        {/* Slack and email alerts card */}
        <div
          className={cn(
            "bg-landing-surface-700 flex items-center justify-between overflow-hidden relative rounded-lg w-full",
            "md:h-[182px] md:flex-row md:pl-8 md:pr-14 md:py-6",
            "flex-col gap-5 p-5"
          )}
        >
          <div className="flex flex-col gap-1 md:h-full items-start shrink-0 md:w-[381px] w-full">
            <p className="font-space-grotesk md:text-2xl md:leading-8 text-xl text-landing-text-100 w-full">
              Slack and email alerts
            </p>
            <p className="font-sans md:text-base text-sm text-landing-text-300 leading-5 w-full">
              Receive alerts about critical issues and weekly summaries of your signal events.
            </p>
          </div>
          <SlackAlertPreview />
          <div className="hidden md:block absolute bottom-0 left-0 right-0 h-[73px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
        </div>
      </div>

      <DocsButton href="https://laminar.sh/docs/signals#signals" />
    </div>
  );
};

export default SignalsSection;
