"use client";

import { animate, motion, type Transition, useMotionValue, useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { swrFetcher } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import TraceViewErrorBoundary from "./error-boundary";
import TraceBento, { type Phase } from "./trace-bento";

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

const TRACE_ID = "281e042a-75d4-5c83-c56e-1b31f0a73080";

// ──────────────────────────────────────────────────────────────────────
// PHASE THRESHOLDS — tune here.
//
// `scrollYProgress` is 0 when the section's top hits the viewport's
// top, and 1 when the section's bottom hits the viewport's bottom.
// Each T_PHASE_N is the progress at which we ENTER phase N. Phase 1
// is everything before T_PHASE_2.
//
// Dwell time of phase N ≈ (T_PHASE_{N+1} - T_PHASE_N) × (section
// height − viewport height). Bump a threshold up to delay that phase
// transition; bump it down to fire earlier.
// ──────────────────────────────────────────────────────────────────────
const T_PHASE_2 = 0.15;
const T_PHASE_3 = 0.53;
const T_PHASE_4 = 0.85;

// ──────────────────────────────────────────────────────────────────────
// LAYOUT — three layers stacked on the z-axis:
//
//   z-0  BENTO  — absolutely positioned, sticky-centered to viewport.
//                 Animating content (slack → trace view → timeline → ask-ai).
//                 Visible only through the gaps; covered by the bands.
//
//   z-10 BANDS  — full-width, bg-surface-700, contain title/body text.
//                 Scroll over the bento in normal flow.
//
//        GAPS   — transparent regions in normal flow between bands.
//                 Reveal the bento. Each carries a "Learn more" link
//                 in the top-right. Gap heights determine pacing — bigger
//                 gap = more scroll dwell in front of that phase's bento.
//
// Phase is derived from `scrollYProgress` via the T_PHASE_N thresholds
// above. Phases 1-4 are scroll-driven; phase 5 is reserved for an
// imperative trigger (planned).
// ──────────────────────────────────────────────────────────────────────

interface BandConfig {
  name: string;
  title?: string;
  body: ReactNode;
  gapHeight: number;
  /** Vertical offset of the bento from the viewport top, in vh. Tweens
   *  smoothly between phases (TWEEN). 25 for the slack phase, 15 for the
   *  trace-view phases. */
  paddingTopVh: number;
  learnMoreHref: string;
}

const BANDS: Record<1 | 2 | 3 | 4, BandConfig> = {
  1: {
    name: "Notifications",
    title: "Get alerts when your agent breaks",
    body: "Describe what you want to track in plain English. Laminar analyzes traces of\nyour agent and pings you in Slack the moment a trace matches.",
    gapHeight: 400,
    paddingTopVh: 34,
    learnMoreHref: "https://laminar.sh/docs/signals",
  },
  2: {
    name: "Signal events",
    title: "Understand why in seconds",
    body: "Go from issue description to the exact step that caused it.",
    gapHeight: 600,
    paddingTopVh: 18,
    learnMoreHref: "https://laminar.sh/docs/signals",
  },
  3: {
    name: "Trace view",
    body: "Laminar makes the agent run navigable by surfacing input, LLM reasoning,\ntool calls, and sub-agents as a readable transcript and timeline.",
    gapHeight: 600,
    paddingTopVh: 18,
    learnMoreHref: "https://laminar.sh/docs/signals",
  },
  4: {
    name: "Ask AI",
    body: "Long complex run? Dig deep into your trace with AI.",
    gapHeight: 800,
    paddingTopVh: 16,
    learnMoreHref: "https://laminar.sh/docs/signals",
  },
};

const progressToPhase = (p: number): Phase => {
  if (p < T_PHASE_2) return 1;
  if (p < T_PHASE_3) return 2;
  if (p < T_PHASE_4) return 3;
  return 4;
};

const UnderstandWhyTraceView = () => {
  // FLAG: single scroll target for the whole section. If you ever want
  // independent scroll-driven animations (e.g. parallax on a band),
  // derive them from this scrollYProgress via useTransform — don't add
  // a second useScroll, since two scroll observers can drift on resize.
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Phase is a discrete state derived from scrollYProgress. We use
  // useMotionValueEvent (which fires on every scroll frame) but only
  // call setPhase when the bucket actually changes — so React re-renders
  // exactly at the four phase boundaries, not on every scroll tick.
  //
  // FLAG: when the planned imperative phase 5 trigger lands, scrolling
  // back through T_PHASE_4 will overwrite phase=5 → phase=4. If phase 5
  // needs to be sticky once set, gate this callback on a "phaseAdvanced"
  // ref or hoist phase into the trace-view store.
  const [phase, setPhase] = useState<Phase>(1);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = progressToPhase(p);
    setPhase((prev) => (prev === next ? prev : next));
  });

  // Slack→signal morph progress (0 = slack, 1 = signal). Driven by phase
  // via framer's `animate` helper so SlackToSignalMorph keeps its existing
  // MotionValue<number> contract — no refactor inside the morph component.
  const morphProgress = useMotionValue(0);
  useEffect(() => {
    const controls = animate(morphProgress, phase >= 2 ? 1 : 0, TWEEN);
    return () => controls.stop();
  }, [phase, morphProgress]);

  const { data: trace } = useSWR<TraceViewTrace>(`/api/shared/traces/${TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`/api/shared/traces/${TRACE_ID}/spans`, swrFetcher);

  return (
    <TraceViewErrorBoundary>
      <section ref={sectionRef} className="bg-landing-surface-550 relative w-full max-w-[880px] mx-auto">
        {/* BENTO LAYER (z-0) — sticky-centered behind everything. The
            absolute wrapper uses pointer-events-none so dead space around
            the bento doesn't intercept clicks meant for the bands above;
            the inner sticky enables pointer-events-auto so the bento
            itself stays interactive (Signals toggle, span clicks). */}
        <div className="absolute inset-0 z-0 flex justify-center pointer-events-none">
          {/* paddingTop tweens between BANDS[phase].paddingTopVh values
              (clamped to band 4 for phase 5). Animating padding rather
              than transform keeps the sticky behavior intact — a
              translateY would fight the browser's sticky positioning. */}
          <motion.div
            initial={false}
            animate={{ paddingTop: `${BANDS[(phase > 4 ? 4 : phase) as 1 | 2 | 3 | 4].paddingTopVh}vh` }}
            transition={TWEEN}
            className="sticky top-0 h-screen flex pointer-events-auto"
          >
            <TraceViewStoreProvider storeKey="landing-understand-why" initialTrace={trace}>
              <TraceBento phase={phase} morphProgress={morphProgress} trace={trace} spans={spans ?? []} />
            </TraceViewStoreProvider>
          </motion.div>
        </div>

        {/* CONTENT LAYER (z-10) — bands and gaps in normal flow. Bands
            cover the bento (opaque bg-surface-700); gaps reveal it
            (transparent). Phase is scroll-derived, not DOM-coupled, so
            gaps don't need refs or data attributes. */}
        <div className="relative z-10 flex flex-col w-full">
          {([1, 2, 3, 4] as const).map((n) => {
            const config = BANDS[n];
            return (
              <Fragment key={n}>
                {/* BAND */}
                <div className="bg-landing-surface-700 w-full flex flex-col items-start gap-2 py-12">
                  {config.title && <h2 className={subSection}>{config.title}</h2>}
                  <p className={bodyMedium}>{config.body}</p>
                </div>

                {/* GAP — top/bottom gradients fade the bento into the band
                    bg; learn-more row sits above them via relative+z-20. */}
                <div style={{ height: config.gapHeight }} className="relative w-full flex items-end">
                  <div className="absolute top-0 left-0 right-0 h-[80px] z-10 bg-gradient-to-b from-landing-surface-550/50 to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 h-[120px] z-10 bg-gradient-to-t from-landing-surface-550 to-transparent pointer-events-none" />
                  <div className="relative z-20 flex justify-between w-full pl-3 pr-2 py-2 text-xs tracking-wider text-landing-text-400">
                    <span className="flex gap-2">
                      <span>0{n}.</span>
                      <span>{config.name.toUpperCase()}</span>
                    </span>
                    <Link
                      href={config.learnMoreHref}
                      target="_blank"
                      className="inline-flex items-center gap-1 hover:text-landing-text-300 transition-colors"
                    >
                      LEARN MORE
                      <ArrowUpRight className="size-4.5" strokeWidth={1.5} />
                    </Link>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </section>
    </TraceViewErrorBoundary>
  );
};

export default UnderstandWhyTraceView;
