"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { subSection } from "../class-names";
import SectionBlock from "./section-block";
import SlackNotificationMock from "./slack-notification-mock";

interface Props {
  className?: string;
}

// Inlined Section markup here so we can drive opacity off scroll progress via
// motion.section (the shared Section primitive isn't reachable through a
// MotionValue style prop).
const GetAlerts = ({ className }: Props) => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0.2, 0.4], [0.3, 1]);

  return (
    <motion.section ref={ref} style={{ opacity }} className={cn("flex flex-col items-center w-full px-6", className)}>
      <h2 className={subSection}>{"Get alerts when\nyour agent breaks."}</h2>
      <div className="flex flex-col items-center gap-[60px] w-full mt-10">
        <SectionBlock
          visual={<SlackNotificationMock />}
          learnMore={{ label: "Learn more about notifications", href: "https://laminar.sh/docs/signals" }}
        />
      </div>
    </motion.section>
  );
};

export default GetAlerts;
