"use client";

import { useMotionValueEvent, useScroll } from "framer-motion";
import { useRef, useState } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { swrFetcher } from "@/lib/utils";

import LearnMoreLink from "../learn-more-link";
import TraceViewErrorBoundary from "./error-boundary";
import StageText, { type Stage } from "./stage-text";
import TraceBento from "./trace-bento";

const TRACE_ID = "281e042a-75d4-5c83-c56e-1b31f0a73080";

// Tall outer height drives the sticky scroll-lock duration — each ~600px of
// scroll advances one stage.
const SCROLL_HEIGHT = 2400;

// Stage thresholds — discrete stages snap as the user passes each boundary.
const computeStage = (p: number): Stage => {
  if (p < 0.2) return 1;
  if (p < 0.45) return 2;
  if (p < 0.7) return 3;
  return 4;
};

// Scroll-locked, 4-stage trace view. Sticky inner content stays pinned while
// `scrollYProgress` runs the bento through transcript → timeline → screen
// recording → span/chat reveal. Wraps everything in an error boundary because
// the shared trace fetch can fail in dev and we don't want to break the page.
const UnderstandWhyTraceView = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const [stage, setStage] = useState<Stage>(1);
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const next = computeStage(latest);
    if (next !== stage) setStage(next);
  });

  const { data: trace } = useSWR<TraceViewTrace>(`/api/shared/traces/${TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`/api/shared/traces/${TRACE_ID}/spans`, swrFetcher);

  return (
    <TraceViewErrorBoundary>
      <div ref={ref} className="w-full" style={{ height: SCROLL_HEIGHT }}>
        <div className="sticky top-[calc(50%-377px)] flex flex-col items-center gap-6 w-full">
          <StageText stage={stage} className="shrink-0" />
          <TraceViewStoreProvider storeKey="landing-understand-why" initialTrace={trace}>
            <TraceBento stage={stage} trace={trace} spans={spans ?? []} />
          </TraceViewStoreProvider>
          <LearnMoreLink label="Learn more about trace view" href="https://laminar.sh/docs/tracing" />
        </div>
      </div>
    </TraceViewErrorBoundary>
  );
};

export default UnderstandWhyTraceView;
