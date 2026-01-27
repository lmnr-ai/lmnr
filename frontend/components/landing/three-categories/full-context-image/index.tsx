"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Content } from "./content";

interface Props {
  className?: string;
}

const FullContextImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useLayoutEffect(() => {
    const updateHeight = () => {
      if (ref.current) {
        setContainerHeight(ref.current.getBoundingClientRect().height);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);
  const translateY = useTransform(scrollYProgress, [0, 1], [containerHeight % -0.2, containerHeight * -0.6]);

  // Determine mode based on scroll progress (tree -> reader at 50%)
  const [mode, setMode] = useState<"tree" | "reader">("tree");

  // Update mode based on scroll progress
  useLayoutEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (value) => {
      setMode(value > 0.5 ? "reader" : "tree");
    });
    return () => unsubscribe();
  }, [scrollYProgress]);

  return (
    <motion.div
      className={cn("size-full bg-landing-surface-700 overflow-hidden relative rounded-sm", className)}
      style={{ opacity }}
      ref={ref}
    >
      <motion.div
        className="absolute inset-0 flex items-start w-[80%] left-1/2 -translate-x-1/2"
        style={{ y: translateY }}
        ref={contentRef}
      >
        <div className="bg-landing-surface-600 flex items-start w-full">
          {/* Main content area */}
          <div className="flex flex-col items-start grow min-w-0 h-full">
            <Content mode={mode} />
          </div>

          {/* Timeline sidebar */}
          <div className="flex gap-1 items-center p-1 self-stretch shrink-0">
            {/* Colored timeline bars */}
            <div className="border-l border-landing-surface-400 flex flex-col gap-px h-full shrink-0">
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[80px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[80px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[80px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[80px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[80px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
            </div>

            {/* Time labels */}
            <div className="flex flex-col font-mono text-[10px] text-landing-text-600 text-right gap-5 h-full shrink-0 leading-normal">
              <p>0s</p>
              <p>10s</p>
              <p>20s</p>
              <p>30s</p>
              <p>40s</p>
              <p>50s</p>
              <p>60s</p>
              <p>70s</p>
              <p>80s</p>
              <p>90s</p>
              <p>100s</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 flex h-[100%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 pointer-events-none" />
    </motion.div>
  );
};

export default FullContextImage;
