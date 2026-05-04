"use client";

import { motion, type MotionValue, type Transition, useMotionValueEvent, type Variants } from "framer-motion";
import { ArrowRight, Bolt, Bot, CirclePlay, type LucideIcon, MessageCircle } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import Header from "@/components/shared/traces/header";
import SessionPlayer from "@/components/shared/traces/session-player";
import { SpanView } from "@/components/shared/traces/span-view";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import Transcript from "@/components/traces/trace-view/transcript";
import Tree from "@/components/traces/trace-view/tree";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { bodySQL } from "../../class-names";
import DocsButton from "../../docs-button";
import AskAi from "./ask-ai";
import TraceSection, { STAGES, type StageVariant } from "./trace-section";

interface Props {
  progress: MotionValue<number>;
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
  initialSpanId?: string;
}

// Geometry — matches Figma node 3847:5548. Bento overflows the visible area in
// stages 1-4 (text panel covers the left part); in stage 5 the text panel
// slides out and the bento sits centered in the full outer container.
const TEXT_PANEL_WIDTH = 445;
const LEFT_COL_WIDTH = 420;

const HIGHLIGHT_COLOR = "#ffffff";
const DIMMED_COLOR = "#92949c";

// Scroll progress thresholds — scroll only picks the discrete stage; Framer
// variants animate smoothly between stages. Boundaries sit between adjacent
// stage centers so a halfway-scrolled position resolves to one stage or the
// other rather than rendering a partially-animated frame.
const computeStage = (p: number): StageVariant => {
  if (p < 0.15) return "timeline";
  if (p < 0.35) return "transcript";
  if (p < 0.55) return "span";
  if (p < 0.75) return "ai";
  return "full";
};

const TRANSITION: Transition = {
  type: "tween",
  duration: 0.2,
  ease: "easeInOut",
};

// Stages where the sections snap together as one bento — flush, flat inner
// corners, no per-section x/y offsets. Only the "full" stage is connected;
// the focus stages spread the sections apart as separate rounded cards.
const CONNECTED_STAGES: StageVariant[] = ["full"];

const withTween = (target: Record<string, unknown>) => ({ ...target, transition: TRANSITION });

const bentoVariants: Variants = {
  timeline: withTween({ x: "45%" }),
  transcript: withTween({ x: "45%" }),
  span: withTween({ x: "20%" }),
  ai: withTween({ x: "-5%" }),
  full: withTween({ x: 0 }),
};

const textPanelVariants: Variants = {
  timeline: withTween({ x: 0 }),
  transcript: withTween({ x: 0 }),
  span: withTween({ x: 0 }),
  ai: withTween({ x: 0 }),
  full: withTween({ x: -TEXT_PANEL_WIDTH }),
};

// Section title — only color animates; size is held at 24px via Tailwind class.
const titleVariantsFor = (active: StageVariant): Variants =>
  Object.fromEntries(STAGES.map((s) => [s, withTween({ color: s === active ? HIGHLIGHT_COLOR : DIMMED_COLOR })]));

const TIMELINE_TITLE_VARIANTS = titleVariantsFor("timeline");
const TRANSCRIPT_TITLE_VARIANTS = titleVariantsFor("transcript");
const SPAN_TITLE_VARIANTS = titleVariantsFor("span");
const AI_TITLE_VARIANTS = titleVariantsFor("ai");

// Subtitle accordion — only the active stage's subtitle is expanded. The
// height: "auto" target is measured by framer-motion at runtime so the
// transition stays smooth. The 4px top spacing lives inside the collapsing
// element (via pt-1 on the inner <p>) so the gap collapses with the height.
const subtitleVariantsFor = (active: StageVariant): Variants =>
  Object.fromEntries(
    STAGES.map((s) => [s, withTween(s === active ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 })])
  );

const TIMELINE_SUBTITLE_VARIANTS = subtitleVariantsFor("timeline");
const TRANSCRIPT_SUBTITLE_VARIANTS = subtitleVariantsFor("transcript");
const SPAN_SUBTITLE_VARIANTS = subtitleVariantsFor("span");
const AI_SUBTITLE_VARIANTS = subtitleVariantsFor("ai");

const noop = () => {};

const TraceBento = ({ progress, trace, spans, initialSpanId }: Props) => {
  const {
    setSpans,
    setTrace,
    setSelectedSpan,
    setHasBrowserSession,
    setBrowserSession,
    selectedSpan,
    tab,
    browserSession,
    hasBrowserSession,
  } = useTraceViewStore(
    (state) => ({
      setSpans: state.setSpans,
      setTrace: state.setTrace,
      setSelectedSpan: state.setSelectedSpan,
      setHasBrowserSession: state.setHasBrowserSession,
      setBrowserSession: state.setBrowserSession,
      selectedSpan: state.selectedSpan,
      tab: state.tab,
      browserSession: state.browserSession,
      hasBrowserSession: state.hasBrowserSession,
    }),
    shallow
  );

  const [stage, setStage] = useState<StageVariant>(() => computeStage(progress.get()));

  useMotionValueEvent(progress, "change", (latest) => {
    setStage((prev) => {
      const next = computeStage(latest);
      return prev === next ? prev : next;
    });
  });

  useEffect(() => {
    if (!trace || spans.length === 0) return;
    setSpans(enrichSpansWithPending(spans));
    setTrace(trace);
    const target = (initialSpanId && spans.find((s) => s.spanId === initialSpanId)) || spans[0];
    setSelectedSpan({ ...target, collapsed: false });
    if (trace.hasBrowserSession) {
      setHasBrowserSession(true);
      setBrowserSession(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace?.id, spans.length]);

  const handleSpanSelect = useCallback((span?: TraceViewSpan) => setSelectedSpan(span), [setSelectedSpan]);

  const llmSpanIds = useMemo(() => spans.filter((s) => s.spanType === SpanType.LLM).map((s) => s.spanId), [spans]);

  return (
    <motion.div
      animate={stage}
      initial="timeline"
      transition={TRANSITION}
      className="relative w-full h-[746px] overflow-hidden rounded-lg bg-landing-surface-700 border border-landing-surface-400"
    >
      {/* Bento — full width, centered, translates to focus the active column */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-[16px]">
        <motion.div variants={bentoVariants} className="flex shrink-0 w-full h-full">
          <div className="flex flex-col h-full shrink-0" style={{ width: LEFT_COL_WIDTH }}>
            <TraceSection
              activeIn={["timeline", "full"]}
              connectedIn={CONNECTED_STAGES}
              keepCorners={{ tl: true }}
              offsetX={-18}
              className="w-full h-[200px]"
            >
              <div className="flex flex-col w-full h-full bg-background overflow-hidden">
                <Header onClose={noop} isHideTimelineControls />
                <div className="flex-1 min-h-0">
                  <CondensedTimeline />
                </div>
              </div>
            </TraceSection>

            <TraceSection
              activeIn={["transcript", "full"]}
              connectedIn={CONNECTED_STAGES}
              keepCorners={{ bl: true }}
              offsetX={-18}
              offsetY={18}
              className="w-full flex-1 min-h-0"
            >
              <div className="flex flex-col w-full h-full bg-background overflow-hidden">
                <div className={cn("flex items-center gap-2 px-2 pt-2 pb-2 border-b box-border")}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <ViewDropdown isDisableHint />
                      {trace && <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} />}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        className={cn("h-6 px-1.5 text-xs", { "border-primary text-primary": browserSession })}
                        variant="outline"
                        onClick={() => setBrowserSession(!browserSession)}
                        disabled={!hasBrowserSession}
                      >
                        <CirclePlay size={14} className="mr-1" />
                        Media
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-1 h-full overflow-hidden relative">
                  {tab === "tree" ? (
                    <Tree onSpanSelect={handleSpanSelect} isShared />
                  ) : (
                    <Transcript onSpanSelect={handleSpanSelect} isShared />
                  )}
                </div>
                {browserSession && trace && (
                  <div className="border-t shrink-0 h-[180px]">
                    <SessionPlayer
                      onClose={() => setBrowserSession(false)}
                      hasBrowserSession={hasBrowserSession}
                      traceId={trace.id}
                      llmSpanIds={llmSpanIds}
                    />
                  </div>
                )}
              </div>
            </TraceSection>
          </div>

          <TraceSection activeIn={["span", "full"]} connectedIn={CONNECTED_STAGES} className="shrink-0 h-full flex-1">
            <div className="w-full h-full bg-background overflow-hidden">
              {selectedSpan && trace ? (
                <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={trace.id} />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-muted-foreground text-sm">
                  Loading…
                </div>
              )}
            </div>
          </TraceSection>

          <TraceSection
            activeIn={["ai", "full"]}
            connectedIn={CONNECTED_STAGES}
            keepCorners={{ tr: true, br: true }}
            offsetX={18}
            className="shrink-0 h-full flex-1"
          >
            <div className="w-full h-full bg-background overflow-hidden">
              <AskAi />
            </div>
          </TraceSection>
        </motion.div>
      </div>

      {/* Text panel — overlay on the left, slides off during stage 4 → 5 */}
      <motion.div
        variants={textPanelVariants}
        style={{ width: TEXT_PANEL_WIDTH }}
        className="absolute top-0 left-0 h-full z-20 p-8 flex flex-col gap-4"
      >
        {/* Solid on the left, fading to transparent on the right ~31% so the
            bento bleeds into the panel edge */}
        <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-l from-transparent to-landing-surface-700/80 to-[31.25%]" />

        <div
          className={cn(
            "flex flex-col relative transition-[padding] duration-200 ease-in-out",
            stage === "timeline" ? "pb-6" : "pb-0"
          )}
        >
          <motion.p variants={TIMELINE_TITLE_VARIANTS} className="font-space-grotesk text-2xl">
            Timeline
          </motion.p>
          <motion.div variants={TIMELINE_SUBTITLE_VARIANTS} className="overflow-hidden">
            <div className="pt-4 flex flex-col gap-4">
              <ul className="flex flex-col gap-1">
                <DotItem className="bg-llm">LLM calls</DotItem>
                <DotItem className="bg-tool">Tool calls</DotItem>
                <DotItem className="bg-subagent/40 border border-subagent">Sub-agents</DotItem>
                <DotItem className="bg-blue-400">Default (container)</DotItem>
              </ul>
              <DocsButton href="https://laminar.sh/docs/platform/viewing-traces#timeline" />
            </div>
          </motion.div>
        </div>

        <div
          className={cn(
            "flex flex-col relative transition-[padding] duration-200 ease-in-out",
            stage === "transcript" ? "py-8" : "py-0"
          )}
        >
          <motion.p variants={TRANSCRIPT_TITLE_VARIANTS} className="font-space-grotesk text-2xl">
            Transcript
          </motion.p>
          <motion.div variants={TRANSCRIPT_SUBTITLE_VARIANTS} className="overflow-hidden">
            <div className="pt-4 flex flex-col gap-4">
              <p className={cn("text-landing-text-300", bodySQL)}>
                Clear, concise view of your agent's decisions and behavior.
              </p>
              <ul className="flex flex-col gap-1">
                <IconItem icon={ArrowRight} className="bg-blue-400">
                  Extracted trace input
                </IconItem>
                <IconItem icon={MessageCircle} className="bg-llm">
                  LLM thinking
                </IconItem>
                <IconItem icon={Bolt} className="bg-tool">
                  Tool input/output
                </IconItem>
                <IconItem icon={Bot} className="bg-subagent">
                  Sub-agent summary
                </IconItem>
              </ul>
              <DocsButton href="https://laminar.sh/docs/platform/viewing-traces#transcript-view" />
            </div>
          </motion.div>
        </div>

        <div
          className={cn(
            "flex flex-col relative transition-[padding] duration-200 ease-in-out",
            stage === "span" ? "py-6" : "py-0"
          )}
        >
          <motion.p variants={SPAN_TITLE_VARIANTS} className="font-space-grotesk text-2xl">
            Select an LLM call
          </motion.p>
          <motion.div variants={SPAN_SUBTITLE_VARIANTS} className="overflow-hidden">
            <div className="pt-4 flex flex-col gap-4">
              <p className={cn("text-landing-text-300", bodySQL)}>
                Select an individual span to dive deep into a LLM or Tool call.
              </p>
              <ul className={cn("flex flex-col gap-1 text-landing-text-300", bodySQL)}>
                <li>System prompts</li>
                <li>User messages</li>
                <li>Duration, tokens, cost</li>
                <li>Model details</li>
              </ul>
            </div>
          </motion.div>
        </div>

        <div
          className={cn(
            "flex flex-col relative transition-[padding] duration-200 ease-in-out",
            stage === "ai" ? "py-6" : "py-0"
          )}
        >
          <motion.p variants={AI_TITLE_VARIANTS} className="font-space-grotesk text-2xl">
            Ask AI
          </motion.p>
          <motion.div variants={AI_SUBTITLE_VARIANTS} className="overflow-hidden">
            <div className="pt-4 flex flex-col gap-4">
              <p className={cn("text-landing-text-300", bodySQL)}>
                Chat with an agent with full context on your trace.
              </p>
              <ul className={cn("flex flex-col gap-1 text-landing-text-300", bodySQL)}>
                <li>Summarize</li>
                <li>Analyze</li>
                <li>Debug</li>
              </ul>
              <DocsButton href="https://laminar.sh/docs/platform/viewing-traces#chat-with-trace" />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const DotItem = ({ className, children }: { className?: string; children: ReactNode }) => (
  <li className={cn("flex items-center gap-3 text-landing-text-300", bodySQL)}>
    <span className={cn("size-3 rounded-full shrink-0", className)} />
    {children}
  </li>
);

const IconItem = ({
  icon: Icon,
  className,
  children,
}: {
  icon: LucideIcon;
  className?: string;
  children: ReactNode;
}) => (
  <li className={cn("flex items-center gap-3 text-landing-text-300", bodySQL)}>
    <span className={cn("size-5 rounded flex items-center justify-center shrink-0", className)}>
      <Icon className="size-4 text-white" />
    </span>
    {children}
  </li>
);

export default TraceBento;
