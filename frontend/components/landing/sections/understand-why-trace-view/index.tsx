"use client";

import { motion, type Transition, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { cn, swrFetcher } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import TraceViewErrorBoundary from "./error-boundary";
import { PHASE_2_SUBTITLES, type Stage } from "./stage-text";
import TraceBento from "./trace-bento";

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

const TRACE_ID = "281e042a-75d4-5c83-c56e-1b31f0a73080";

// ──────────────────────────────────────────────────────────────────────
// SCROLL CHOREOGRAPHY — all tunable knobs live here.
//
// The whole section is one scroll target. `scrollYProgress` is 0 when
// the section's top hits the viewport's top, 1 when its bottom hits
// the viewport's bottom (offset: ["start start", "end end"]).
//
// Each T_STAGE_N is the fraction of progress at which we ENTER stage N.
// Dwell time of a stage = (T_next - T_this) * scrollable distance,
// where scrollable distance ≈ SECTION_HEIGHT_PX − viewport height.
//
// MORPH_START/END drive the slack→signal morph as a sub-range of the
// same axis (so it can't drift from the stage transitions).
// ──────────────────────────────────────────────────────────────────────
const SECTION_HEIGHT_PX = 3000;

// Stage 1 spans 0 → T_STAGE_2, etc. Bump these to tweak dwell.
const T_STAGE_2 = 0.2;
const T_STAGE_3 = 0.23;
const T_STAGE_4 = 0.55;
const T_STAGE_5 = 0.75;

// Morph window (within stage 1→2 hand-off). Keep MORPH_END ≤ T_STAGE_3
// or the morph will still be tweening after the bento has moved on.
const MORPH_START = 0.27;
const MORPH_END = 0.33;

// Stage 1 content block height. Pixel-fixed (not vh) so threshold-to-pixel
// math is deterministic across viewports. The inner slack content stays
// vertically centered in the viewport via `top: 50vh; -translate-y-1/2`,
// so its absolute position is unaffected by this number — only the block's
// scroll-out point is.
const STAGE_1_BLOCK_PX = 900;

const progressToStage = (p: number): Stage => {
  if (p < T_STAGE_2) return 1;
  if (p < T_STAGE_3) return 2;
  if (p < T_STAGE_4) return 3;
  if (p < T_STAGE_5) return 4;
  return 5;
};

const UnderstandWhyTraceView = () => {
  // FLAG: single scroll target for the whole section. If we ever want
  // independent scroll-driven animations (e.g. a parallax image), derive
  // them from the same scrollYProgress via useTransform — don't add a
  // second useScroll, since two scroll observers will drift on resize.
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Initial stage is 1 on first paint. On deep-link / mid-section scroll
  // restore, the first scroll event corrects it within one frame.
  const [stage, setStage] = useState<Stage>(1);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = progressToStage(p);
    setStage((prev) => (prev === next ? prev : next));
  });

  // Morph (slack → signal) — clamped so it stays 0 before MORPH_START and
  // 1 after MORPH_END, regardless of scroll position elsewhere on the page.
  const morphProgress = useTransform(scrollYProgress, [MORPH_START, MORPH_END], [0, 1], { clamp: true });

  // True only when the bento has all three panels open (Trace + Span + AskAi).
  // Span panel requires a user click on a span at stage 5 — we don't open it
  // automatically. Drives the left text col's collapse-to-center animation.
  const [allPanelsOpen, setAllPanelsOpen] = useState(false);

  const { data: trace } = useSWR<TraceViewTrace>(`/api/shared/traces/${TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`/api/shared/traces/${TRACE_ID}/spans`, swrFetcher);

  return (
    <TraceViewErrorBoundary>
      {/* Fixed-height section is the single source of truth for scroll
          progress. Threshold-to-pixel mapping breaks if this becomes
          content-sized (e.g. minHeight + tall children). Keep it explicit. */}
      <section ref={sectionRef} style={{ height: SECTION_HEIGHT_PX }} className="w-full">
        <div className="w-full h-full flex flex-col items-center">
          {/* The row's gap collapses to 0 at stage 5 so the bento ends up
              dead-centered (a non-zero gap would offset it by gap/2 against
              the freed text-col space). */}
          <motion.div
            initial={{ gap: 20 }}
            animate={{ gap: allPanelsOpen ? 0 : 20 }}
            transition={TWEEN}
            className="flex justify-between min-w-[880px] gap-5 h-full"
          >
            {/* LEFT — text column. Animates to width 0 + opacity 0 at stage 5
                so the bento can read as the focus, centered. SSR width matches
                the animate target (400) via `w-[400px]` + `initial`, so framer
                doesn't measure the natural DOM size on mount and there's no
                flash from auto → 400. */}
            <motion.div
              initial={{ width: 400, opacity: 1 }}
              animate={{ width: allPanelsOpen ? 0 : 400, opacity: allPanelsOpen ? 0 : 1 }}
              transition={TWEEN}
              className={cn("flex flex-col shrink-0 w-[400px] h-full", allPanelsOpen && "pointer-events-none")}
            >
              {/* Stage 1 — Slack notification: "Get alerts". This block
                  scrolls past normally (not sticky) as the user enters phase
                  2. Inner content is absolute-positioned at viewport center. */}
              <div style={{ height: STAGE_1_BLOCK_PX }} className="min-w-[380px] relative shrink-0">
                <div
                  style={{ top: "50vh" }}
                  className="-translate-y-1/2 absolute left-0 flex flex-col justify-start items-start gap-6"
                >
                  <h2 className={subSection}>{"Get alerts when your agent breaks."}</h2>
                  <p className={bodyMedium}>
                    Describe what you want to track in plain English. Laminar analyzes traces of your agent and pings
                    you in Slack the moment a trace matches.
                  </p>
                  <LearnMoreLink label="Learn more about signals" href="https://laminar.sh/docs/signals" />
                </div>
              </div>

              {/* Phase 2 — "Understand why in seconds" spans stages 2-5.
                  Sticky title + dynamic subtitle. flex-1 absorbs the rest of
                  the section's height so sticky positioning has runway. */}
              <div className="flex-1 min-w-[320px] relative">
                <div className="sticky top-0 h-screen flex items-center">
                  <div className="flex flex-col gap-6 items-start h-[70vh]">
                    <div className="flex flex-col gap-2">
                      <h2 className={subSection}>{"Understand why in seconds."}</h2>
                      {PHASE_2_SUBTITLES[stage] && <p className={bodyMedium}>{PHASE_2_SUBTITLES[stage]}</p>}
                    </div>
                    <LearnMoreLink label="Learn more about Signals" href="https://laminar.sh/docs/signals" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* RIGHT — visual. flex-1 + justify-end keeps the bento pinned to
                the right side of the inner container. h-full lets the sticky
                child stick within the section's full vertical runway. */}
            <div className="flex-1 flex justify-end h-full">
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
