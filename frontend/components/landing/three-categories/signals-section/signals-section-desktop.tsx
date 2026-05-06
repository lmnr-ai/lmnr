"use client";

import { motion, type MotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

import MockTracesTable from "./mock-traces-table";
import SignalsMockUI from "./signals-mock-ui";
import { type SignalTabKey } from "./signals-mock-ui/mock-data";

interface Props {
  className?: string;
  progress: MotionValue<number>;
}

type TabKey = SignalTabKey | "anything";

const ANYTHING_PROMPT = "Track literally anything you're looking for, in plain English";

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
    label: "User intent",
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
  "Laminar detects events from your traces based on your prompt",
  "Clusters are automatically created in an organized hierarchy.",
];

// Master progress is mapped from the section's scrollYProgress through this
// window. Outside [0.2, 0.8] the master clamps to 0/1. The window is shifted
// off the absolute bounds so the animation actually plays during the visible
// portion of the scroll rather than hanging at one end.
const MASTER_INPUT_RANGE = [0, 1] as const;

// Stage thresholds along the master 0-1 axis.
const STAGE_1_END = 0.33;
const STAGE_2_END = 0.66;

// Right column geometry. Taller than the card's inner area so the mocks run off
// the bottom edge (clipped by the card's overflow-hidden). Width is wider than
// the available flex space so they also run off the right edge.
const RIGHT_HEIGHT = 731;
const RIGHT_WIDTH = 920;
const SCAN_HEIGHT = 450;

// Swap window — narrow band around STAGE_1_END where traces table animates
// out and signals window animates in.
const SWAP_START = 0.25;
const SWAP_END = 0.45;
const SWAP_MIDPOINT = (SWAP_START + SWAP_END) / 2;

// Stage 2 -> 3 transition: events header collapses, clusters panel expands.
const REVEAL_START = 0.62;
const REVEAL_END = 0.78;

const SignalsSectionDesktop = ({ className, progress }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>("detect-failures");
  const [promptValue, setPromptValue] = useState(TABS[0].quote);
  const mockTabKey: SignalTabKey = activeTab === "anything" ? "detect-failures" : activeTab;

  const masterProgress = useTransform(progress, [MASTER_INPUT_RANGE[0], MASTER_INPUT_RANGE[1]], [0, 1], {
    clamp: true,
  });

  // Description-line highlight stage. Driven discretely off masterProgress
  // because color crossfades on body text feel jittery as continuous transforms.
  const [lineStage, setLineStage] = useState<0 | 1 | 2>(0);
  useMotionValueEvent(masterProgress, "change", (v) => {
    const next: 0 | 1 | 2 = v < STAGE_1_END ? 0 : v < STAGE_2_END ? 1 : 2;
    setLineStage((prev) => (prev === next ? prev : next));
  });

  // Scan rectangle continuously slides from top to bottom of the traces table.
  const scanY = useTransform(
    masterProgress,
    [0, STAGE_1_END * 0.7, STAGE_1_END],
    [-SCAN_HEIGHT, RIGHT_HEIGHT * 0.3, RIGHT_HEIGHT - 40],
    {
      clamp: true,
    }
  );
  const scanOpacity = useTransform(masterProgress, [0, STAGE_1_END * 0.95, STAGE_1_END], [1, 1, 0], { clamp: true });

  const tracesX = useTransform(masterProgress, [SWAP_START, SWAP_END], [0, 60], { clamp: true });
  const tracesY = useTransform(masterProgress, [SWAP_START, SWAP_END], [0, 60], { clamp: true });
  const tracesOpacity = useTransform(masterProgress, [SWAP_START, SWAP_END], [1, 0], { clamp: true });

  const signalsX = useTransform(masterProgress, [SWAP_START, SWAP_END], [60, 0], { clamp: true });
  const signalsY = useTransform(masterProgress, [SWAP_START, SWAP_END], [60, 0], { clamp: true });
  const signalsOpacity = useTransform(masterProgress, [SWAP_START, SWAP_END], [0, 1], { clamp: true });

  const eventsHeaderProgress = useTransform(masterProgress, [REVEAL_START, REVEAL_END], [1, 0], { clamp: true });
  const clustersProgress = useTransform(masterProgress, [REVEAL_START, REVEAL_END], [0, 1], { clamp: true });

  const handleTabClick = useCallback((tab: (typeof TABS)[number]) => {
    setActiveTab(tab.key);
    setPromptValue(tab.quote);
  }, []);

  // Discrete pointer-events flag — switching layers based on which is "ahead"
  // of the swap midpoint. Avoids the layered-tabs issue where the invisible
  // panel still intercepts hovers/clicks.
  const [signalsActive, setSignalsActive] = useState(false);
  useMotionValueEvent(masterProgress, "change", (v) => {
    setSignalsActive((prev) => {
      const next = v >= SWAP_MIDPOINT;
      return prev === next ? prev : next;
    });
  });

  return (
    <div className={cn("flex flex-col items-center w-full gap-8", className)}>
      <div className="grid grid-cols-4 gap-3 items-stretch w-full">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={cn(
                "flex-1 min-w-0 flex items-center justify-center py-2 px-2 rounded transition-colors text-center leading-tight",
                "font-sans text-base text-landing-text-100 whitespace-nowrap truncate",
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

      <div className="flex bg-landing-surface-700 gap-[20px] h-[671px] items-start overflow-hidden rounded w-full relative flex-row pl-9 pt-7 pb-8">
        <div className="absolute left-0 bottom-0 w-full bg-gradient-to-t from-landing-surface-700 to-transparent h-[140px] z-10 pointer-events-none" />

        <div className="flex flex-col font-normal h-full items-start justify-start shrink-0 w-[340px] gap-8 z-20">
          <div className="flex flex-col items-start w-full">
            <p
              className={cn(
                "font-space-grotesk text-landing-text-300 transition-all duration-300 ease-in-out",
                lineStage === 0 ? "text-base leading-5" : "text-xl leading-6"
              )}
            >
              Prompt
            </p>
            <motion.div
              initial={false}
              animate={lineStage === 0 ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden w-full"
            >
              <p
                className={cn(
                  "font-space-grotesk text-2xl leading-8 w-full pt-1 transition-colors",
                  lineStage === 0 ? "text-landing-text-100" : "text-landing-text-300"
                )}
              >
                {activeTab === "anything" ? (
                  <>
                    <span className="inline-block w-[2px] h-[1em] bg-landing-primary-400 align-middle landing-caret-blink" />
                    <span className="text-landing-text-400">{ANYTHING_PROMPT}</span>
                  </>
                ) : (
                  promptValue
                )}
              </p>
            </motion.div>
          </div>
          <div className="flex flex-col gap-8 items-start w-full pr-8">
            {DESCRIPTION_LINES.map((line, i) => (
              <p
                key={i}
                className={cn(
                  "font-space-grotesk text-xl leading-6 w-full transition-colors",
                  lineStage === i + 1 ? "text-landing-text-100" : "text-landing-text-300"
                )}
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="relative shrink-0" style={{ height: RIGHT_HEIGHT, width: RIGHT_WIDTH }}>
          <motion.div
            style={{ x: tracesX, y: tracesY, opacity: tracesOpacity }}
            className={cn("absolute inset-0", signalsActive && "pointer-events-none")}
          >
            <div className="relative flex flex-col w-full h-full overflow-hidden border rounded-lg bg-background p-4 gap-2">
              <p className="text-sm text-secondary-foreground pl-1 shrink-0">Traces</p>
              <MockTracesTable className="flex-1 min-h-0" />
              <motion.div
                style={{ y: scanY, opacity: scanOpacity }}
                className="absolute left-0 right-0 top-0 pointer-events-none"
              >
                <div
                  className="w-full bg-gradient-to-t from-primary/20 via-primary/10 via-5% to-transparent border-b border-primary/30"
                  style={{ height: SCAN_HEIGHT }}
                />
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            style={{ x: signalsX, y: signalsY, opacity: signalsOpacity }}
            className={cn("absolute inset-0", !signalsActive && "pointer-events-none")}
          >
            <SignalsMockUI
              key={mockTabKey}
              tabKey={mockTabKey}
              className="h-full"
              eventsHeaderProgress={eventsHeaderProgress}
              clustersProgress={clustersProgress}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default SignalsSectionDesktop;
