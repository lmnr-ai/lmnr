"use client";

import { motion, type Transition, useInView, useScroll } from "framer-motion";
import { useRef, useState } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { cn, swrFetcher } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import TraceViewErrorBoundary from "./error-boundary";
import { type Stage, TRACE_LEARN_MORE, TRACE_STAGE_TEXTS, type TraceStage } from "./stage-text";
import TraceBento from "./trace-bento";

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

const TRACE_ID = "281e042a-75d4-5c83-c56e-1b31f0a73080";

// Active stage = whichever block currently crosses the viewport centerline.
// useInView with -50%/-50% margins collapses the IntersectionObserver "root"
// to a 1px line at viewport center — the hand-off between stages is
// pixel-accurate. Per-stage dwell time is the block's height in JSX — no
// numeric constants govern stage transitions in this file.
const CENTERLINE = "-50% 0px -50% 0px";

const UnderstandWhyTraceView = () => {
  const stage1Ref = useRef<HTMLDivElement>(null);
  const stage2Ref = useRef<HTMLDivElement>(null);
  const stage3Ref = useRef<HTMLDivElement>(null);
  const stage4Ref = useRef<HTMLDivElement>(null);
  const stage5Ref = useRef<HTMLDivElement>(null);
  const stage6Ref = useRef<HTMLDivElement>(null);

  const stage1Active = useInView(stage1Ref, { margin: CENTERLINE });
  const stage2Active = useInView(stage2Ref, { margin: CENTERLINE });
  const stage3Active = useInView(stage3Ref, { margin: CENTERLINE });
  const stage4Active = useInView(stage4Ref, { margin: CENTERLINE });
  const stage5Active = useInView(stage5Ref, { margin: CENTERLINE });
  const stage6Active = useInView(stage6Ref, { margin: CENTERLINE });

  // Morph (slack → signal) is driven by stage 2's scroll progress.
  const { scrollYProgress: morphProgress } = useScroll({
    target: stage2Ref,
    offset: ["start end", "start center"],
  });

  // The active stage is the centerline block that's currently in view.
  // Scrolled past the section (none of the blocks intersecting), we keep the
  // last stage — useState holds the memory, the during-render `setState`
  // updates it only when an `*Active` boolean is true. React's "store info
  // from prev render" pattern: lint-clean (no useEffect) and avoids the
  // stage-drops-to-1 visual snap when fast-scrolling past the section.
  const activeStage: Stage | null = stage1Active
    ? 1
    : stage2Active
      ? 2
      : stage3Active
        ? 3
        : stage4Active
          ? 4
          : stage5Active
            ? 5
            : stage6Active
              ? 6
              : null;
  const [stage, setStage] = useState<Stage>(1);
  if (activeStage !== null && activeStage !== stage) setStage(activeStage);

  // True only when the bento has all three panels open (Trace + Span + AskAi).
  // Span panel requires a user click on a span at stage 6 — we don't open it
  // automatically. Drives the left text col's collapse-to-center animation.
  const [allPanelsOpen, setAllPanelsOpen] = useState(false);

  const { data: trace } = useSWR<TraceViewTrace>(`/api/shared/traces/${TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`/api/shared/traces/${TRACE_ID}/spans`, swrFetcher);

  const traceStage: TraceStage = stage >= 3 ? (stage as TraceStage) : 3;

  return (
    <TraceViewErrorBoundary>
      <section className="w-full">
        <div className="w-full flex flex-col items-center">
          {/* The row's gap collapses to 0 at stage 6 so the bento ends up
              dead-centered (a non-zero gap would offset it by gap/2 against
              the freed text-col space). */}
          <motion.div
            animate={{ gap: allPanelsOpen ? 0 : 20 }}
            transition={TWEEN}
            className="flex justify-between min-w-[880px]"
          >
            {/* LEFT — text column. Animates to width 0 + opacity 0 at stage 6
                so the bento can read as the focus, centered. Each text block
                has min-w-[320px] so its content doesn't reflow as the parent
                shrinks — they extend past the (now-zero-width) parent's
                bounds, but opacity-0 hides them and the bento overlays them. */}
            <motion.div
              animate={{ width: allPanelsOpen ? 0 : 320, opacity: allPanelsOpen ? 0 : 1 }}
              transition={TWEEN}
              className={cn("flex flex-col shrink-0", allPanelsOpen && "pointer-events-none")}
            >
              <div ref={stage1Ref} className="flex flex-col gap-6 items-start justify-center h-screen min-w-[380px]">
                <h2 className={subSection}>{"Get alerts when your agent breaks."}</h2>
                <p className="text-white/75">
                  Describe what you want to track in plain English. Laminar analyzes traces of your agent and pings you
                  in Slack the moment a trace matches.
                </p>
                <LearnMoreLink label="Learn more about signals" href="https://laminar.sh/docs/signals" />
              </div>
              <div
                ref={stage2Ref}
                className="flex flex-col gap-6 items-start justify-center h-[200px] min-w-[320px]"
              ></div>

              {/* Trace stages 3-6 — one block per substage. Block height is
                  the dwell time for that substage. The sticky title is
                  overlaid via an absolutely-positioned wrapper so the
                  substage triggers can be empty boxes that just drive the
                  centerline detection. */}
              <div className="relative min-w-[320px]">
                <div ref={stage3Ref} className="h-[600px]" />
                <div ref={stage4Ref} className="h-[600px]" />
                <div ref={stage5Ref} className="h-[600px]" />
                <div ref={stage6Ref} className="h-[600px]" />

                <div className="absolute inset-0">
                  <div className="sticky top-0 h-screen flex items-center">
                    <div className="flex flex-col gap-6 items-start h-[500px]">
                      <h2 className={subSection}>{TRACE_STAGE_TEXTS[traceStage].title}</h2>
                      {TRACE_STAGE_TEXTS[traceStage].subtitle && (
                        <p className={bodyMedium}>{TRACE_STAGE_TEXTS[traceStage].subtitle}</p>
                      )}
                      <LearnMoreLink {...TRACE_LEARN_MORE} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* RIGHT — visual. flex-1 + justify-end keeps the bento pinned to
                the right side of the inner container. min-width auto on the
                flex item means when the bento's own min-content exceeds the
                flex share, the column grows and the inner container stretches
                past 880px symmetrically (still centered by outer items-center).
                At stage 6 the left col collapses to 0, the gap closes, and
                the bento ends up centered in the viewport on its own. */}
            <div className="flex-1 flex justify-end">
              <div className="sticky top-0 h-screen flex items-center w-fit">
                <TraceViewStoreProvider storeKey="landing-understand-why" initialTrace={trace}>
                  <TraceBento
                    stage={stage}
                    morphProgress={morphProgress}
                    trace={trace}
                    spans={spans ?? []}
                    onAllPanelsOpenChange={setAllPanelsOpen}
                  />
                </TraceViewStoreProvider>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </TraceViewErrorBoundary>
  );
};

export default UnderstandWhyTraceView;
