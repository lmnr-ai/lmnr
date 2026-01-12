"use client";

import { cn } from "@/lib/utils";
import { useScroll, useTransform, motion } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

interface Props {
  className?: string;
}

const EvalsImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.6], [0, 0.8, 1]);
  const y1 = useTransform(scrollYProgress, [0, 1], ["40px", "-40px"]);
  const y2 = useTransform(scrollYProgress, [0, 1], ["80px", "-80px"]);

  return (
    <div
      ref={ref}
      className={cn(
        "bg-landing-surface-700 h-[630px] items-center justify-center overflow-hidden p-8 rounded-lg w-full relative border border-landing-surface-400",
        className
      )}
    >
      {/* Bottom evals image */}
      <motion.div
        className="absolute left-[45%] top-[55%] -translate-x-1/2 -translate-y-1/2 w-[70%]"
        style={{ opacity, y: y1 }}
      >
        <Image
          src="/assets/landing/evals.png"
          alt="Evals"
          width={1000}
          height={0}
          className="w-full h-auto rounded-lg border border-landing-surface-400"
        />
      </motion.div>

      {/* Top evals graph image - layered on top */}
      <motion.div
        className="absolute left-[70%] top-[80%] -translate-x-1/2 -translate-y-1/2 w-[50%] z-30"
        style={{ opacity, y: y2 }}
      >
        <Image
          src="/assets/landing/evals-graph.png"
          alt="Evals Graph"
          width={1000}
          height={0}
          className="w-full h-auto rounded-lg border border-landing-text-600"
        />
      </motion.div>

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 flex h-[60%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 pointer-events-none z-20" />
    </div>
  );
};

export default EvalsImage;
