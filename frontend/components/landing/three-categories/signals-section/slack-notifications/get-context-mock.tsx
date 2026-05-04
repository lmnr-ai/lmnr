import { motion, type MotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { ExternalLink, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { Fragment, useState } from "react";

import { cn } from "@/lib/utils";
import getContextTrace from "@/public/assets/landing/signals/get-context-trace.png";

interface Props {
  className?: string;
  progress: MotionValue<number>;
}

const TABS = [
  { id: "failure-detector", label: "Failure Detector", active: true },
  { id: "skills-suggestions", label: "Skills Suggestions", active: false },
  { id: "github-comments", label: "Github Comments A...", active: false },
];

type DescPart = string | { kind: "span"; label: string };

const DESCRIPTION: DescPart[] = [
  "The agent encountered multiple bash failures while trying to sync the repository. Specifically, it forgot to change directories into the repository in ",
  { kind: "span", label: "Bash" },
  " span and failed to correctly fetch the remote branch in ",
  { kind: "span", label: "Bash" },
  " span. These errors led to consecutive LLM calls each costing ~90k tokens ($0.05+).",
];

type Atom = { kind: "word"; text: string } | { kind: "pill"; label: string };

const tokenize = (parts: DescPart[]): Atom[] => {
  const atoms: Atom[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      const words = part.split(/\s+/).filter(Boolean);
      for (const w of words) atoms.push({ kind: "word", text: w });
    } else {
      atoms.push({ kind: "pill", label: part.label });
    }
  }
  return atoms;
};

const ATOMS = tokenize(DESCRIPTION);
// First 6 words ("The agent encountered multiple bash failures") are visible from keyframe 1.
const PREVISIBLE_ATOMS = 6;

const SpanPill = ({ label }: { label: string }) => (
  <span className="inline-flex items-center px-1.5 rounded text-xs bg-[rgba(208,117,78,0.5)] text-landing-text-100 font-medium">
    {label}
  </span>
);

const GetContextMock = ({ className, progress: rawProgress }: Props) => {
  // Phase A: shrink description (gap, padding) over progress 0 -> 0.5.
  const progress = useTransform(rawProgress, [0.3, 0.5], [0, 1], { clamp: true });
  const phaseA = useTransform(progress, [0, 0.5], [0, 1], { clamp: true });
  // Signal events card content / styling (header, tabs, buttons, category, card+desc bg/border, error color).
  // Finishes ahead of the screenshot so the card is fully formed before the trace fully fades in.
  const signalEventsCardOpacity = useTransform(progress, [0.35, 0.8], [0.1, 1], { clamp: true });
  // Trace screenshot fade — spans the full second half of the section.jk
  const imageOpacity = useTransform(progress, [0.5, 1], [0, 1], { clamp: true });

  // Description container metrics.
  const descPaddingX = useTransform(phaseA, [0, 1], [12, 8]);
  const descPaddingY = useTransform(phaseA, [0, 1], [10, 6]);
  const descGap = useTransform(phaseA, [0, 1], [8, 4]);

  // Description container bg/border swap from surface-600/400 -> blue tint, alongside the card fade.
  const descBg = useTransform(
    signalEventsCardOpacity,
    [0, 0.3, 1],
    ["rgb(37, 37, 38)", "rgb(37, 37, 38, 0.2)", "rgba(147, 197, 253, 0.05)"]
  );
  const descBorder = useTransform(
    signalEventsCardOpacity,
    [0, 0.5, 1],
    ["rgb(46, 46, 47)", "rgb(46, 46, 47, 0.2)", "rgba(191, 219, 254, 0.1)"]
  );
  const errorColor = useTransform(signalEventsCardOpacity, [0, 1], ["rgb(146, 148, 156)", "rgba(191, 219, 254, 0.6)"]);

  // Outer mock container bg/border tracks the card opacity.
  const cardBg = useTransform(signalEventsCardOpacity, [0, 1], ["rgba(96, 165, 250, 0)", "rgba(96, 165, 250, 0.12)"]);
  const cardBorder = useTransform(
    signalEventsCardOpacity,
    [0, 1],
    ["rgba(96, 165, 250, 0)", "rgba(96, 165, 250, 0.3)"]
  );

  // Smooth scalar that drives word-by-word reveal, spanning the full second half (independent of card opacity).
  const typingProgress = useTransform(progress, [0.5, 1], [0, 1], { clamp: true });
  const revealCount = useTransform(typingProgress, (v) => v * (ATOMS.length - PREVISIBLE_ATOMS));

  // Whole mock scales up from the left edge during the back half of the section.
  const wrapperScale = useTransform(progress, [0, 1], [1.1, 0.6], { clamp: true });
  const wrapperY = useTransform(progress, [0, 1], [-96, 0], { clamp: true });

  // Track how many atoms are currently visible so we can render only those (the rest stay hidden).
  // Using a state synced from the motion value keeps re-renders coarse (one re-render per word).
  // Initialize from current progress so a mid-scroll mount doesn't flash with only 6 words.
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(ATOMS.length, PREVISIBLE_ATOMS + Math.floor(revealCount.get()))
  );
  useMotionValueEvent(revealCount, "change", (latest) => {
    const next = Math.min(ATOMS.length, PREVISIBLE_ATOMS + Math.floor(latest));
    setVisibleCount((prev) => (prev === next ? prev : next));
  });

  return (
    <motion.div
      style={{ scale: wrapperScale, transformOrigin: "left center", y: wrapperY }}
      className={cn("relative", className)}
    >
      <motion.div
        aria-hidden
        style={{ opacity: imageOpacity, left: -9, top: -75, width: 884, height: 876 }}
        className="absolute pointer-events-none select-none overflow-hidden rounded-lg border border-landing-surface-400"
      >
        <Image src={getContextTrace} alt="" fill sizes="884px" className="object-cover" priority={false} />
      </motion.div>

      <div className="relative bg-landing-surface-700 w-[470px] h-[300px]">
        <motion.div
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          className="flex flex-col rounded-md border border-solid overflow-hidden font-sans select-none gap-1 p-1 h-full"
        >
          <motion.div
            style={{ opacity: signalEventsCardOpacity }}
            className="flex items-center justify-between pl-2.5 pr-2 pt-1.5 shrink-0"
          >
            <span className="text-xs font-medium text-blue-200/60">Signal events</span>
            <X className="size-3.5 text-blue-200/60" />
          </motion.div>

          <div className="flex flex-col gap-1.5 px-2 pb-1.5">
            <motion.div
              style={{ opacity: signalEventsCardOpacity }}
              className="inline-flex h-8 w-full items-center justify-center rounded-lg p-[3px] bg-blue-300/10 shrink-0"
            >
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    "flex-1 h-full flex items-center justify-center rounded-md text-xs px-2 truncate",
                    tab.active ? "bg-gray-900 text-foreground shadow-sm" : "text-foreground/80"
                  )}
                >
                  {tab.label}
                </div>
              ))}
            </motion.div>

            <motion.div style={{ opacity: signalEventsCardOpacity }} className="flex gap-1.5 shrink-0">
              <div className="flex items-center gap-1 rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1 text-xs text-foreground">
                <Sparkles className="size-3" />
                Open in AI Chat
              </div>
              <div className="flex items-center gap-1 rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1 text-xs text-foreground">
                <ExternalLink className="size-3" />
                Open in Signals
              </div>
            </motion.div>

            <motion.div
              style={{ opacity: signalEventsCardOpacity }}
              className="rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1.5"
            >
              <div className="text-xs text-blue-200/60 mb-1">category</div>
              <div className="inline-flex items-center px-2 py-0.5 rounded-full border border-blue-200/20 text-xs text-foreground">
                logic_error
              </div>
            </motion.div>

            <motion.div
              style={{
                backgroundColor: descBg,
                borderColor: descBorder,
                paddingLeft: descPaddingX,
                paddingRight: descPaddingX,
                paddingTop: descPaddingY,
                paddingBottom: descPaddingY,
                rowGap: descGap,
              }}
              className="rounded-md border border-solid flex flex-col"
            >
              <motion.div style={{ color: errorColor }} className="font-medium leading-none text-xs">
                Error
              </motion.div>
              <motion.p className="leading-5 text-secondary-foreground break-words text-xs">
                {ATOMS.slice(0, visibleCount).map((atom, i) => (
                  <Fragment key={i}>
                    {i > 0 && " "}
                    {atom.kind === "pill" ? <SpanPill label={atom.label} /> : <span>{atom.text}</span>}
                  </Fragment>
                ))}
              </motion.p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default GetContextMock;
