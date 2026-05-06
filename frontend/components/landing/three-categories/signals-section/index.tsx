"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import SignalsSectionDesktop from "./signals-section-desktop";
import SignalsSectionMobile from "./signals-section-mobile";
import SlackNotifications from "./slack-notifications";

interface Props {
  className?: string;
}

const TITLE = "One million agent runs, what went wrong?";
const SUBTITLE = "Signals answer any question about your agents at scale";

const SignalsSection = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const bufferHeight = useTransform(scrollYProgress, [0, 1], ["12vh", "0vh"]);

  return (
    <div className={cn("flex flex-col md:gap-[54px] items-start w-full gap-8", className)}>
      {/* Desktop: elongated scroll container with sticky sub-pin (mirrors composable-trace/desktop-tree). */}
      <div ref={ref} className="hidden md:block h-[1800px] w-full">
        <div className="sticky top-[calc(50%-403px)] flex flex-col gap-[54px] items-start w-full">
          <div className="flex flex-col gap-1 items-start w-full">
            <motion.div className="w-full" style={{ height: bufferHeight }} />
            <h2 className={subsectionTitle}>{TITLE}</h2>
            <p className={bodyLarge}>{SUBTITLE} </p>
          </div>
          <SignalsSectionDesktop progress={scrollYProgress} />
        </div>
      </div>

      {/* Mobile: static layout, no scroll choreography. */}
      <div className="md:hidden flex flex-col gap-8 w-full">
        <div className="flex flex-col gap-1 items-start w-full">
          <h2 className={subsectionTitle}>{TITLE}</h2>
          <p className={bodyLarge}>{SUBTITLE} </p>
        </div>
        <SignalsSectionMobile />
      </div>

      <SlackNotifications />
      <DocsButton href="https://laminar.sh/docs/signals#signals" />
    </div>
  );
};

export default SignalsSection;
