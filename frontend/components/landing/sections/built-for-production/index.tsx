"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { bodyMedium } from "../../class-names";
import LearnMoreLink from "../two-lines-to-integrate/learn-more-link";

// FLAG: "Read more" needs a real destination — once we publish a compression
// deep-dive, swap `/blog` for that post.

// Shared so the bar and its label stay locked together.
const BAR_TRANSITION = { duration: 0.5, ease: "easeOut" } as const;

const BuiltForProduction = () => (
  <section className="flex flex-col items-start w-full">
    <div className="flex flex-col gap-10 w-full">
      <p className="font-sans-landing font-medium text-foreground-50 text-[48px] leading-[50px] md:leading-[60px] tracking-[-0.02em]">
        20x cheaper storage
      </p>

      <div className="flex flex-col gap-10 md:flex-row md:gap-16 md:items-start w-full">
        <div className="flex flex-col gap-3 items-start shrink-0">
          <p className={cn(bodyMedium, "w-[320px]")}>
            Laminar stores only the unique content in agent runs, leading to faster ingestion and 20x cheaper storage.
          </p>

          <LearnMoreLink href="https://laminar.sh/blog/laminar-20x-agent-trace-compression" label="Read more" />
        </div>

        <div className="flex flex-col gap-1 items-start w-full md:flex-1 md:min-w-0 py-[7px] relative overflow-hidden">
          <div className="flex h-8.5 items-center justify-end px-3 whitespace-nowrap w-full rounded-r-md bg-surface-400 text-foreground-50">
            <p className="font-medium">Competition</p>
          </div>
          {/* Both bars start full width; Laminar's shrinks to show the 20x. Its label
              rides the shrinking right edge — `left-full` anchors it there, so it only
              has to unhook from `x: -100%` (right-aligned inside) to `0` (outside). */}
          <motion.div
            className="flex h-8.5 items-center w-full"
            initial="full"
            whileInView="compressed"
            viewport={{ once: true, amount: 0.6 }}
          >
            <motion.div
              className="relative flex h-full items-center rounded-r-md bg-primary-300"
              variants={{ full: { width: "100%" }, compressed: { width: "5%" } }}
              transition={BAR_TRANSITION}
            >
              <motion.p
                className="absolute left-full top-0 flex h-full items-center px-3 whitespace-nowrap text-foreground-50"
                variants={{ full: { x: "-100%" }, compressed: { x: "0%" } }}
                transition={BAR_TRANSITION}
              >
                Laminar
              </motion.p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
