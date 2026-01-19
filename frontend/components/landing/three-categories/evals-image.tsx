"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const EvalsImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  //const opacity = useTransform(scrollYProgress, [0, 0.3, 0.5, 0.6], [0, 0.8, 1, 0.4]);
  const y1 = useTransform(scrollYProgress, [0, 1], ["80px", "-80px"]);
  //const y2 = useTransform(scrollYProgress, [0, 0.5, 0.7, 1], ["400px", "200px", "0px", "-80px"]);
  const tracesX = useTransform(scrollYProgress, [0.35, 0.5], ["100%", "0%"]);

  return (
    <div
      ref={ref}
      className={cn(
        "bg-landing-surface-700 aspect-[8/5] justify-center overflow-hidden rounded-lg w-full relative border border-landing-surface-400 pt-[40px] flex px-[72px]",
        className
      )}
    >
      {/* Bottom evals image */}
      <motion.div className="w-full relative overflow-hidden h-fit" style={{ y: y1 }}>
        <Image
          src="/assets/landing/evals-section.png"
          alt="Evals"
          width={1000}
          height={0}
          className="w-full h-auto rounded-lg border border-landing-surface-400"
        />
        <motion.div className="absolute top-[6px] right-0 bottom-0 z-20 h-full" style={{ x: tracesX }}>
          <Image
            src="/assets/landing/evals-section-traces.png"
            alt="Evals"
            width={1000}
            height={0}
            className="h-full w-auto rounded-r-lg"
          />
        </motion.div>
      </motion.div>

      {/* Top evals graph image - layered on top 
      <motion.div className="absolute right-[50px] top-[90%] -translate-y-1/2 z-30 w-[70%]" style={{ y: y2 }}>
        <Image
          src="/assets/landing/evals-graph.png"
          alt="Evals Graph"
          width={1000}
          height={0}
          className="w-full h-auto rounded-lg border border-landing-text-600"
        />
      </motion.div>
      */}

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 flex h-[60%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 pointer-events-none z-20" />

      {/* Gradient overlay at bottom 
      <div className="absolute bottom-0 left-0 flex h-[40%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 pointer-events-none z-40 opacity-80" />
      */}
    </div>
  );
};

export default EvalsImage;
