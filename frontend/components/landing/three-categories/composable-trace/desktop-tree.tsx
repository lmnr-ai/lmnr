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
  traceId: string;
  initialSpanId: string;
}

const DesktopTree = ({ className, traceId, initialSpanId }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const easedProgress = useTransform(scrollYProgress, [0.4, 0.45], [0, 1]);

  const { data: trace } = useSWR<TraceViewTrace>(`/api/shared/traces/${traceId}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`/api/shared/traces/${traceId}/spans`, swrFetcher);

  return (
    <div ref={ref} className={cn("flex flex-col gap-[54px] items-start w-full", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>Full context at a glance</h2>
        <p className={bodyLarge}>This is a real Laminar trace</p>
      </div>

      <TraceViewStoreProvider storeKey="landing-composable-trace" initialTrace={trace}>
        <TraceBento progress={easedProgress} trace={trace} spans={spans ?? []} initialSpanId={initialSpanId} />
      </TraceViewStoreProvider>

      <DocsButton href="https://laminar.sh/docs/tracing/introduction" />
    </div>
  );
};

export default DesktopTree;
