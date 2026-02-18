"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import SignalsImage from "./signals-image";

interface Props {
  className?: string;
}

const SignalsSection = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const rawBufferHeight = useTransform(scrollYProgress, [0, 1], [10, 0]);
  const springBufferHeight = useSpring(rawBufferHeight, { stiffness: 100, damping: 30, mass: 1 });
  const bufferHeight = useTransform(springBufferHeight, (v) => `${v}vh`);

  return (
    <div className="h-[2000px] w-full" ref={ref}>
      <div className={cn("sticky top-[calc(50%-430px)] flex flex-col md:gap-[54px] items-start w-full", "gap-8")}>
        <div className="flex flex-col gap-1 items-start w-full">
          <motion.div className="w-full" style={{ height: bufferHeight }} />
          <h2 className={subsectionTitle}>Signals answer any question, from any trace, at scale</h2>
          <p className={bodyLarge}>
            Describe a Signal you're looking for, Laminar extracts it from past and future traces.
          </p>
        </div>
        <SignalsImage scrollProgress={scrollYProgress} />
        <DocsButton href="https://docs.laminar.sh/signals#signals" />
      </div>
    </div>
  );
};

export default SignalsSection;
