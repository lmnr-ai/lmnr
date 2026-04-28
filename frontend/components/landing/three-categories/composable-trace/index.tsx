"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import TraceSection from "./trace-section";

interface Props {
  className?: string;
}

const ComposableTrace = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });

  const containerGap = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const containerPadding = useTransform(scrollYProgress, [0, 1], [0, 32]);
  const outerOpacity = useTransform(scrollYProgress, [0.2, 0.9], [0, 1]);

  return (
    <div ref={ref} className={cn("hidden md:flex flex-col gap-[54px] items-start w-full", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>Full context at a glance</h2>
        <p className={bodyLarge}>This is a real Laminar trace</p>
      </div>

      <motion.div
        style={{ padding: containerPadding, gap: containerGap }}
        className="flex w-full h-[765px] relative overflow-hidden"
      >
        <motion.div
          style={{ opacity: outerOpacity }}
          className="absolute inset-0 rounded-lg bg-landing-surface-700 border border-landing-surface-400 pointer-events-none"
        />

        <motion.div style={{ gap: containerGap }} className="flex flex-col flex-1 min-w-0 h-full relative z-10">
          <TraceSection label="Timeline" progress={scrollYProgress} className="w-full h-[140px] shrink-0" />
          <TraceSection label="Transcript" progress={scrollYProgress} className="w-full flex-1 min-h-0" />
        </motion.div>

        <TraceSection
          label="Span View"
          progress={scrollYProgress}
          className="w-[526px] h-full shrink-0 relative z-10"
        />
      </motion.div>

      <DocsButton href="https://laminar.sh/docs/tracing/introduction" />
    </div>
  );
};

export default ComposableTrace;
