"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

import AnimatedThreads0 from "./animated-threads-0";
import AnimatedThreads1 from "./animated-threads-1";
import AnimatedThreads2 from "./animated-threads-2";
import ClustersPanel from "./clusters-panel";
import DefinitionCard from "./definition-card";
import EventsTable from "./events-table";
import SectionTitle from "./section-title";

const SECTION_WIDTH = "w-[420px] md:w-[515px]";
const SECTION_HEIGHT = "h-[400px] md:h-[490px]";

interface Props {
  className?: string;
  scrollProgress: MotionValue<number>;
}

const SignalsImage = ({ className, scrollProgress: scrollProgressProp }: Props) => {
  const scrollProgress = useTransform(scrollProgressProp, (v) => {
    const t = Math.max(0, Math.min(1, v));
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  });
  const marginLeft = useTransform(scrollProgress, [0, 1], ["0%", "100%"]);
  const x = useTransform(scrollProgress, [0, 1], ["0%", "-100%"]);

  // Map scroll ranges to 0→1 progress for each child
  const threads0Progress = useTransform(scrollProgress, [0.0, 0.15], [0, 1]);
  const threads1Progress = useTransform(scrollProgress, [0.2, 0.5], [0, 1]);
  const threads2Progress = useTransform(scrollProgress, [0.55, 0.9], [0, 1]);
  const typingProgress = useTransform(scrollProgress, [0.12, 0.3], [0, 1]);
  const eventsScrollProgress = useTransform(scrollProgress, [0.3, 1], [0, 1]);
  const clustersProgress = useTransform(scrollProgress, [0.7, 1], [0, 1]);

  return (
    <div
      className={cn(
        "bg-landing-surface-700 md:h-[630px] h-[560px] overflow-hidden rounded-lg w-full relative border border-landing-surface-400 pr-[200px]",
        className
      )}
    >
      <div className="absolute bottom-0 right-0 flex h-full w-[30%] items-center justify-center pointer-events-none bg-gradient-to-l from-landing-surface-700 to-landing-surface-700/0 z-20" />

      <div className="absolute bottom-0 left-0 flex h-[40%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 pointer-events-none z-20" />

      <motion.div style={{ marginLeft, x }} className="flex items-start pt-5 pb-8 h-full shrink-0 w-max">
        {/* Column 1: Trace threads visualization */}
        <div className="flex flex-col h-full items-start justify-between shrink-0 w-[661px]">
          <SectionTitle lines={["Analyze millions of traces", "down to the individual span"]} className="px-5" />
          <div className={cn("flex flex-col items-center justify-center rounded w-full", SECTION_HEIGHT)}>
            <AnimatedThreads0 progress={threads0Progress} />
          </div>
        </div>

        {/* Column 2: Signal Definition */}
        <div className={cn("flex flex-col h-full items-start justify-between shrink-0", SECTION_WIDTH)}>
          <SectionTitle lines={["Define what you're looking for and", "specify the output format"]} />
          <DefinitionCard progress={typingProgress} className={cn(SECTION_HEIGHT, "w-full")} />
        </div>

        {/* Connector 1: Straight horizontal lines */}
        <div className="flex h-full items-end shrink-0">
          <div className={cn("flex flex-col items-center justify-center rounded w-[220px]", SECTION_HEIGHT)}>
            <div className="h-[62px] w-[220px]">
              <AnimatedThreads1 progress={threads1Progress} />
            </div>
          </div>
        </div>

        {/* Column 3: Events table */}
        <div className={cn("flex flex-col h-full items-start justify-between shrink-0", SECTION_WIDTH)}>
          <SectionTitle lines={["Signals agent extracts events", "based on your definition"]} />
          <div className={cn("flex flex-col justify-center w-full", SECTION_HEIGHT)}>
            <EventsTable progress={eventsScrollProgress} />
          </div>
        </div>

        {/* Connector 2: Curved lines */}
        <div className="flex h-full items-end shrink-0">
          <div className={cn("flex flex-col items-center justify-center rounded w-[220px]", SECTION_HEIGHT)}>
            <div className="h-[145px] w-[220px]">
              <AnimatedThreads2 progress={threads2Progress} />
            </div>
          </div>
        </div>

        {/* Column 4: Clusters */}
        <div className={cn("flex flex-col h-full items-start justify-between shrink-0", SECTION_WIDTH)}>
          <SectionTitle lines={["All events are clustered", "for high-level insights"]} />

          <div className={cn("flex flex-col justify-center w-full", SECTION_HEIGHT)}>
            <ClustersPanel progress={clustersProgress} />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SignalsImage;
