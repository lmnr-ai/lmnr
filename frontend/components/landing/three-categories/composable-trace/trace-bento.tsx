"use client";

import {
  AnimatePresence,
  motion,
  type MotionValue,
  type Transition,
  useMotionValueEvent,
  type Variants,
} from "framer-motion";
import { CirclePlay } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import browserUseLogo from "@/assets/landing/logos/browser-use.svg";
import browserbaseLogo from "@/assets/landing/logos/browserbase.svg";
import kernelLogo from "@/assets/landing/logos/kernel.svg";
import playwrightLogo from "@/assets/landing/logos/playwright.svg";
import stagehandLogo from "@/assets/landing/logos/stagehand.svg";
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

import { subsectionTitle } from "../../class-names_old";
import DocsButton from "../../docs-button";
import AskAi from "./ask-ai";
import TraceSection, { STAGES, type StageVariant } from "./trace-section";

interface Props {
  progress: MotionValue<number>;
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
}

// Geometry — matches Figma node 3847:5548. Bento overflows the visible area in
// stages 1-4 (text panel covers the left part); in stage 5 the text panel
// slides out and the bento sits centered in the full outer container.
const TEXT_PANEL_WIDTH = 445;

const HIGHLIGHT_COLOR = "#ffffff";
const DIMMED_COLOR = "#92949c";
export const bodyClassName = "font-sans font-normal md:leading-7 md:text-lg text-landing-text-300 text-md leading-7";

// Scroll progress thresholds — scroll only picks the discrete stage; Framer
// variants animate smoothly between stages. Boundaries sit between adjacent
// stage centers so a halfway-scrolled position resolves to one stage or the
// other rather than rendering a partially-animated frame.
const computeStage = (p: number): StageVariant => {
  if (p < 0.25) return "transcript";
  if (p < 0.5) return "recording";
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
  transcript: withTween({ x: "45%" }),
  recording: withTween({ x: "45%" }),
  ai: withTween({ x: "-5%" }),
  full: withTween({ x: 0 }),
};

const textPanelVariants: Variants = {
  transcript: withTween({ x: 0 }),
  recording: withTween({ x: 0 }),
  ai: withTween({ x: 0 }),
  full: withTween({ x: -TEXT_PANEL_WIDTH }),
};

// Section title — only color animates; size is held at 24px via Tailwind class.
const titleVariantsFor = (active: StageVariant): Variants =>
  Object.fromEntries(STAGES.map((s) => [s, withTween({ color: s === active ? HIGHLIGHT_COLOR : DIMMED_COLOR })]));

const TRANSCRIPT_TITLE_VARIANTS = titleVariantsFor("transcript");
const RECORDING_TITLE_VARIANTS = titleVariantsFor("recording");
const AI_TITLE_VARIANTS = titleVariantsFor("ai");

// Subtitle accordion — only the active stage's subtitle is expanded. The
// height: "auto" target is measured by framer-motion at runtime so the
// transition stays smooth. The 4px top spacing lives inside the collapsing
// element (via pt-1 on the inner <p>) so the gap collapses with the height.
const subtitleVariantsFor = (active: StageVariant): Variants =>
  Object.fromEntries(
    STAGES.map((s) => [s, withTween(s === active ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 })])
  );

const TRANSCRIPT_SUBTITLE_VARIANTS = subtitleVariantsFor("transcript");
const RECORDING_SUBTITLE_VARIANTS = subtitleVariantsFor("recording");
const AI_SUBTITLE_VARIANTS = subtitleVariantsFor("ai");

// Wrapper variants for the conditional SpanView column. Using a stage-keyed
// variant (instead of `animate={{flexGrow: 1}}` as an object) keeps Framer's
// variant cascade alive so the inner TraceSection still receives the current
// stage and uncovers itself at the "full" stage. Each stage holds flexGrow at
// 1; initial/exit drop to 0 so the column expands/collapses its width via
// AnimatePresence on mount/unmount. Animating flexGrow (rather than opacity
// or width) lets the panel grow into its natural flex share while overflow:
// hidden clips the inner content — no ghost outline flashing on entry/exit.
const SPAN_VIEW_WRAPPER_VARIANTS: Variants = Object.fromEntries(STAGES.map((s) => [s, { flexGrow: 1 }]));

const SPAN_VIEW_ENTER_EXIT_TRANSITION: Transition = { type: "spring", stiffness: 300, damping: 30 };

const noop = () => {};

const TraceBento = ({ progress, trace, spans }: Props) => {
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
  const stageRef = useRef<StageVariant>(stage);

  // Sync the session player to the scroll-driven stage on transitions only.
  // Between transitions the user can freely toggle Media without scroll fighting them.
  // The ref avoids putting a side effect inside a setState updater.
  useMotionValueEvent(progress, "change", (latest) => {
    const next = computeStage(latest);
    const prev = stageRef.current;
    if (next === prev) return;
    stageRef.current = next;
    setStage(next);
    setBrowserSession(next === "recording");
    // Scrolling back up out of the final stage closes the span panel so it
    // doesn't reappear mid-transition when the user scrolls down again.
    if (prev === "full" && next !== "full") {
      setSelectedSpan(undefined);
    }
  });

  useEffect(() => {
    if (!trace || spans.length === 0) return;
    setSpans(enrichSpansWithPending(spans));
    setTrace(trace);
    if (trace.hasBrowserSession) {
      setHasBrowserSession(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace?.id, spans.length]);

  // Span clicks during the scroll animation are silently ignored — selection
  // only takes effect once we've reached the final stage.
  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (stageRef.current !== "full") return;
      setSelectedSpan(span);
    },
    [setSelectedSpan]
  );
  const handleCloseSpan = useCallback(() => setSelectedSpan(undefined), [setSelectedSpan]);

  const llmSpanIds = useMemo(() => spans.filter((s) => s.spanType === SpanType.LLM).map((s) => s.spanId), [spans]);

  // SpanView is hidden during the scroll animation and only appears once the
  // user has reached the final stage AND a span is selected. The X button on
  // SpanView clears selectedSpan to dismiss it.
  const isShowSpanView = stage === "full" && !!selectedSpan && !!trace;

  // Target width for the SpanView column. When mounted, all three panels are
  // flex-1 and share the bento width equally, so the SpanView's natural width
  // is bentoWidth / 3. We pin the inner content to this width via absolute
  // positioning so that the outer wrapper can animate flexGrow 0→1 without
  // the SpanView's text reflowing as the wrapper expands/collapses (mirrors
  // the pattern in trace-view/dynamic-width-layout.tsx).
  const bentoRef = useRef<HTMLDivElement>(null);
  const [spanPanelTargetWidth, setSpanPanelTargetWidth] = useState(0);
  useEffect(() => {
    const el = bentoRef.current;
    if (!el) return;
    // Seed synchronously so the absolute inner div has a non-zero width on
    // the very first reveal (ResizeObserver fires async after first paint).
    setSpanPanelTargetWidth(el.getBoundingClientRect().width / 3);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSpanPanelTargetWidth(entry.contentRect.width / 3);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      animate={stage}
      initial="transcript"
      transition={TRANSITION}
      className="relative w-full h-[746px] overflow-hidden rounded-lg bg-landing-surface-700 border border-landing-surface-500"
    >
      {/* Bento — full width, centered, translates to focus the active column */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-4">
        <motion.div ref={bentoRef} variants={bentoVariants} className="flex shrink-0 w-full h-full">
          <div className="flex flex-col h-full shrink-0 flex-1">
            <TraceSection
              activeIn={["transcript", "recording", "full"]}
              connectedIn={CONNECTED_STAGES}
              keepCorners={{ tl: true, bl: true }}
              offsetX={-18}
              className="w-full h-full"
            >
              <div className="flex flex-col w-full h-full bg-background overflow-hidden">
                <div className="shrink-0 h-[160px] flex flex-col overflow-hidden border-b">
                  <Header onClose={noop} isHideTimelineControls />
                  <div className="flex-1 min-h-0">
                    <CondensedTimeline />
                  </div>
                </div>
                <div className={cn("flex items-center gap-2 px-2 pt-2 pb-2 border-b box-border")}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <ViewDropdown isDisableHint />
                      {trace && <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} />}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        disabled={!trace}
                        className={cn("h-6 px-1.5 text-xs overflow-hidden", {
                          "border-primary text-primary": browserSession,
                        })}
                        variant="outline"
                        onClick={() => setBrowserSession(!browserSession)}
                      >
                        <CirclePlay size={14} className="flex-shrink-0" />
                        <span className="ml-1 truncate">Media</span>
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
                <AnimatePresence initial={false}>
                  {browserSession && trace && (
                    <motion.div
                      key="session-player"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 280, opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
                      className="border-t shrink-0 overflow-hidden"
                    >
                      {/* Inner fixed-height wrapper keeps SessionPlayer (rrweb) from
                          re-laying out on every animated frame. */}
                      <div className="h-[280px]">
                        <SessionPlayer
                          onClose={() => setBrowserSession(false)}
                          hasBrowserSession={hasBrowserSession}
                          traceId={trace.id}
                          llmSpanIds={llmSpanIds}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TraceSection>
          </div>

          <AnimatePresence initial={false}>
            {isShowSpanView && (
              <motion.div
                key="span-view"
                variants={SPAN_VIEW_WRAPPER_VARIANTS}
                initial={{ flexGrow: 0 }}
                animate={stage}
                exit={{ flexGrow: 0 }}
                transition={SPAN_VIEW_ENTER_EXIT_TRANSITION}
                className="relative h-full flex-1 overflow-hidden"
              >
                <div className="absolute inset-y-0 left-0" style={{ width: spanPanelTargetWidth }}>
                  <TraceSection activeIn={["full"]} connectedIn={CONNECTED_STAGES} className="w-full h-full">
                    <div className="w-full h-full bg-background overflow-hidden">
                      <SpanView
                        key={selectedSpan!.spanId}
                        spanId={selectedSpan!.spanId}
                        traceId={trace!.id}
                        onClose={handleCloseSpan}
                      />
                    </div>
                  </TraceSection>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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

        <div className={cn("flex flex-col relative transition-[padding] duration-200 ease-in-out")}>
          <motion.p variants={TRANSCRIPT_TITLE_VARIANTS} className={cn("font-space-grotesk", subsectionTitle)}>
            Transcript
          </motion.p>
          <motion.div variants={TRANSCRIPT_SUBTITLE_VARIANTS} className="overflow-hidden">
            <div className="pt-4 flex flex-col gap-4">
              <p className={cn("text-landing-text-300", bodyClassName)}>
                Laminar processes your agent logs so you see only what's important.
              </p>
              <p className={cn("text-landing-text-300", bodyClassName)}>
                Clear, concise view of your agent's decisions and behavior.
              </p>
              <DocsButton href="https://laminar.sh/docs/platform/viewing-traces#transcript-view" />
            </div>
          </motion.div>
        </div>

        <div className="w-[80%] border border-b" />

        <div className={cn("flex flex-col relative transition-[padding] duration-200 ease-in-out")}>
          <motion.p variants={RECORDING_TITLE_VARIANTS} className={cn("font-space-grotesk", subsectionTitle)}>
            Browser screen recording
          </motion.p>
          <motion.div variants={RECORDING_SUBTITLE_VARIANTS} className="overflow-hidden">
            <div className="pt-4 flex flex-col gap-4">
              <p className={cn("text-landing-text-300", bodyClassName)}>See into your agent's headless browser.</p>
              <p className={cn("text-landing-text-300", bodyClassName)}>
                See every click and what your agent was thinking at each step.
              </p>
              <ul className="flex flex-col gap-1">
                <IntegrationItem logoSrc={browserUseLogo} alt="Browser Use">
                  Browser Use
                </IntegrationItem>
                <IntegrationItem logoSrc={stagehandLogo} alt="Stagehand">
                  Stagehand
                </IntegrationItem>
                <IntegrationItem logoSrc={playwrightLogo} alt="Playwright">
                  Playwright
                </IntegrationItem>
                <IntegrationItem logoSrc={kernelLogo} alt="Kernel">
                  Kernel
                </IntegrationItem>
                <IntegrationItem logoSrc={browserbaseLogo} alt="Browserbase">
                  Browserbase
                </IntegrationItem>
              </ul>
              <DocsButton href="https://laminar.sh/docs/tracing/browser-agent-observability" label="More" />
            </div>
          </motion.div>
        </div>

        <div className="w-[80%] border border-b" />

        <div className={cn("flex flex-col relative transition-[padding] duration-200 ease-in-out")}>
          <motion.p variants={AI_TITLE_VARIANTS} className={cn("font-space-grotesk", subsectionTitle)}>
            Chat with your trace
          </motion.p>
          <motion.div variants={AI_SUBTITLE_VARIANTS} className="overflow-hidden">
            <div className="pt-4 flex flex-col gap-4">
              <p className={cn("text-landing-text-300", bodyClassName)}>Two hour agent run? Let AI analyze for you.</p>
              <p className={cn("text-landing-text-300", bodyClassName)}>
                Summarize, ask questions, and find bugs hidden deep in your data.
              </p>
              <DocsButton href="https://laminar.sh/docs/platform/viewing-traces#chat-with-trace" />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const IntegrationItem = ({
  logoSrc,
  alt,
  children,
}: {
  logoSrc?: StaticImageData;
  alt?: string;
  children: ReactNode;
}) => (
  <li className={cn("flex items-center gap-3 text-landing-text-300", bodyClassName)}>
    {logoSrc ? (
      <Image src={logoSrc} alt={alt ?? ""} width={20} height={20} className="size-5 object-contain shrink-0" />
    ) : (
      <span className="size-5 rounded shrink-0 bg-landing-surface-400" />
    )}
    {children}
  </li>
);

export default TraceBento;
