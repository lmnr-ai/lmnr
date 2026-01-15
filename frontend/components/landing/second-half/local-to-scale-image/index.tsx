"use client";

import { cn } from "@/lib/utils";
import { motion, MotionValue, useTransform } from "framer-motion";
import {
  ChevronDown,
  ChevronsRight,
  PlayCircle,
  Share2,
  Maximize,
  Clock,
  DollarSign,
  List,
  Filter,
  Search,
  FileText,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import BoltStep from "./bolt-step";
import LLMStep from "./llm-step";
import PricingStep from "./pricing-step";
import { traceSteps } from "./trace-steps";

interface Props {
  className?: string;
  scrollYProgress: MotionValue<number>;
}

const LocalToScaleImage = ({ className, scrollYProgress }: Props) => {
  // Terminal animations - stays visible during "local" section, slides out during transition
  const terminalX = useTransform(scrollYProgress, [0.4, 0.5], [40, -600]);
  const terminalOpacity = useTransform(scrollYProgress, [0.4, 0.7], [1, 0.6]);

  // Gradient animations - fade in as terminal leaves
  const gradientOpacity = useTransform(scrollYProgress, [0.4, 0.8], [0, 1]);

  // Trace content scroll - the entire trace panel scrolls up including header
  const traceY = useTransform(scrollYProgress, [0.3, 1], [0, -1400]);

  // Height expansion - grow by ~40% on scroll to emphasize scale
  const containerHeight = useTransform(scrollYProgress, [0.3, 0.8], [400, "500"]);

  // Width shrinks to 80% on scroll
  const containerWidth = useTransform(scrollYProgress, [0.3, 0.8], [500, 480]);

  // Border fades away during transition
  const borderColor = useTransform(scrollYProgress, [0.4, 0.6], ["rgba(58, 58, 58, 1)", "rgba(58, 58, 58, 0)"]);

  // Background transitions from surface-600 to surface-700
  const backgroundColor = useTransform(
    scrollYProgress,
    [0.4, 0.8],
    ["var(--color-landing-surface-700)", "var(--color-landing-surface-800)"]
  );

  // Text to skeleton transition - text fades out, skeletons fade in
  const textOpacity = useTransform(scrollYProgress, [0.3, 0.6], [1, 0]);
  const skeletonOpacity = useTransform(scrollYProgress, [0.3, 0.6], [0, 1]);

  return (
    <div className={cn("relative", className)}>
      {/* Main container with animated height and width */}
      <motion.div
        className="rounded-lg overflow-hidden relative"
        style={{
          height: containerHeight,
          width: containerWidth,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: borderColor,
          backgroundColor: backgroundColor,
        }}
      >
        {/* Scrolling Trace Panel - entire panel scrolls including header */}
        <motion.div
          className="flex flex-col items-start w-full absolute"
          style={
            {
              y: traceY,
              // @ts-ignore - CSS custom properties work but TS doesn't know about them
              "--text-opacity": textOpacity,
              "--skeleton-opacity": skeletonOpacity,
            } as React.CSSProperties
          }
        >
          {/* Trace Panel Header */}
          <div className="border-b border-landing-surface-400 flex flex-col gap-3 px-4 py-3 w-full shrink-0">
            <div className="flex items-center justify-between w-full">
              <div className="flex gap-4 items-center">
                <div className="flex gap-1 items-center">
                  <ChevronsRight className="w-5 h-5 text-landing-text-500" />
                  <Maximize className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-base">Trace</p>
                <div className="bg-landing-surface-600 border-[0.5px] border-landing-surface-400 flex gap-2 items-center px-2 py-0.5 rounded">
                  <div className="flex gap-1 items-center">
                    <Clock className="w-2.5 h-2.5 text-landing-text-500" />
                    <p className="text-landing-text-500 text-xs">123.36s</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <DollarSign className="w-3 h-3 text-landing-text-500" />
                    <p className="text-landing-text-500 text-xs">81k</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <DollarSign className="w-3 h-3 text-landing-text-500" />
                    <p className="text-landing-text-500 text-xs">0.005</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-4 h-4 text-landing-text-500" />
                <ChevronDown className="w-4 h-4 text-landing-text-500 rotate-180" />
                <PlayCircle className="w-4 h-4 text-landing-text-500" />
                <Share2 className="w-4 h-4 text-landing-text-500" />
              </div>
            </div>
            <div className="flex gap-2 items-center w-full">
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <List className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Reader</p>
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <Filter className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Filters</p>
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <Search className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Search</p>
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <FileText className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Metadata</p>
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <Sparkles className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Ask AI</p>
              </div>
            </div>
          </div>

          {/* Many trace steps to emphasize scale */}
          {traceSteps.map((step, i) => {
            if (step.type === "bolt") return <BoltStep key={i} text={step.text} />;
            if (step.type === "llm") return <LLMStep key={i} expanded={step.expanded} content={step.content} />;
            if (step.type === "pricing") return <PricingStep key={i} />;
            return null;
          })}
        </motion.div>

        {/* Top Gradient - fades in as terminal leaves - from surface-800 (page background) */}
        <motion.div
          className="absolute top-0 left-0 w-full h-[200px] bg-gradient-to-b from-landing-surface-800 to-transparent z-10 pointer-events-none"
          style={{ opacity: gradientOpacity }}
        />

        {/* Bottom Gradient - fades in as terminal leaves - from surface-800 (page background) */}
        <motion.div
          className="absolute bottom-0 left-0 w-full h-[200px] bg-gradient-to-t from-landing-surface-800 to-transparent z-10 pointer-events-none"
          style={{ opacity: gradientOpacity }}
        />
      </motion.div>

      {/* Terminal Overlay - positioned OUTSIDE/below the trace container */}
      <div className="absolute -left-[80px] bottom-[80px] z-30 h-[160px] w-[calc(100%+40px)] overflow-hidden">
        <div className="h-full w-[40px] absolute left-0 top-0 bg-gradient-to-r from-landing-surface-800 to-landing-surface-800/0 z-40" />
        <motion.div className="absolute h-full w-[80%]" style={{ x: terminalX, opacity: terminalOpacity }}>
          <div className="bg-landing-surface-600 border border-landing-surface-400 rounded-lg px-5 py-4 size-full  shadow-2xl">
            <div className="flex flex-col font-mono text-sm text-landing-text-300">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3 text-landing-text-500" />
                <span>git clone https://github.com/lmnr-ai/lmnr</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3 text-landing-text-500" />
                <span>cd lmnr</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3 text-landing-text-500" />
                <span>docker compose up -d</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LocalToScaleImage;
