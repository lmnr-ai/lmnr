"use client";

import { useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { cn, swrFetcher } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import TraceBento from "./trace-bento";

interface Props {
  className?: string;
}

const TRACE_ID = "3603700e-d02b-0c39-0f34-cfd20842c5ae";
const INITIAL_SPAN_ID = "00000000-0000-0000-edcc-7f0be2fb4397";

const ComposableTrace = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const easedProgress = useTransform(scrollYProgress, [0.4, 0.45], [0, 1]);

  const { data: trace } = useSWR<TraceViewTrace>(`/api/shared/traces/${TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`/api/shared/traces/${TRACE_ID}/spans`, swrFetcher);

  return (
    <div ref={ref} className={cn("hidden md:flex flex-col gap-[54px] items-start w-full", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>Full context at a glance</h2>
        <p className={bodyLarge}>This is a real Laminar trace</p>
      </div>

      <TraceViewStoreProvider storeKey="landing-composable-trace" initialTrace={trace}>
        <TraceBento progress={easedProgress} trace={trace} spans={spans ?? []} initialSpanId={INITIAL_SPAN_ID} />
      </TraceViewStoreProvider>

      <DocsButton href="https://laminar.sh/docs/tracing/introduction" />
    </div>
  );
};

export default ComposableTrace;
