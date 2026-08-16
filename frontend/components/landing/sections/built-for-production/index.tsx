"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import LearnMoreLink from "../two-lines-to-integrate/learn-more-link";

// FLAG: "Learn more" needs a real destination — once we publish a compression
// deep-dive, swap the blog link for that post.

// Bar row height. Both bars share it, and the Laminar one is the 1/20th that
// gives the section its headline, so it is a PERCENTAGE of the track rather
// than the fixed 34px the Figma frame happens to draw — the ratio is the claim.
const BAR_H = "h-8";

const BuiltForProduction = () => (
  <section className="flex flex-col items-start w-full">
    <div className="flex flex-col gap-8 w-full">
      <div className="flex flex-col gap-1">
        <p className="font-sans-landing font-medium text-foreground-50 text-[60px] leading-[60px] tracking-[-0.02em]">
          20x
        </p>
        <p className={subSection}>data compression</p>
      </div>

      <div className="flex flex-col gap-10 md:flex-row md:gap-13 md:items-start w-full">
        <div className="flex flex-col gap-5 items-start w-full md:w-[313px] md:shrink-0">
          <p className={bodyMedium}>
            Laminar stores only the unique content in agent runs, leading to faster ingestion, cheaper storage, and more
            efficient analysis.
          </p>

          <div className="flex gap-6 items-start">
            <div className="flex flex-col items-start">
              <p className={subSection}>20x</p>
              <p className={bodyMedium}>faster ingestion</p>
            </div>
            <div className="flex flex-col items-start">
              <p className={subSection}>20x</p>
              <p className={bodyMedium}>cheaper storage</p>
            </div>
          </div>

          <LearnMoreLink href="https://laminar.sh/blog/laminar-20x-agent-trace-compression" label="Learn more" />
        </div>

        {/* Bars sit a touch below the copy's cap height rather than flush with
            it, which is the pt on desktop only — stacked, they follow the copy. */}
        <div className="flex flex-col gap-1 items-start w-full md:flex-1 md:min-w-0 md:pt-2">
          <motion.div
            className={cn(
              BAR_H,
              "flex items-center justify-end px-3 overflow-hidden whitespace-nowrap w-full rounded-sm bg-surface-400"
            )}
            initial={{ width: 0 }}
            whileInView={{ width: "100%" }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <p className="text-sm text-foreground-300">Competition</p>
          </motion.div>
          <div className={cn(BAR_H, "flex items-center gap-3 w-full")}>
            <motion.div
              className="h-full shrink-0 rounded-sm bg-primary-400"
              initial={{ width: 0 }}
              whileInView={{ width: "5%" }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
            <p className="text-sm text-foreground-50">Laminar</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
