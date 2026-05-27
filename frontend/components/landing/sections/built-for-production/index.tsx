"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import LearnMoreLink from "../two-lines-to-integrate/learn-more-link";

// FLAG: "Read more" needs a real destination — once we publish a compression
// deep-dive, swap `/blog` for that post.

const BuiltForProduction = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={cn(subSection)}>Production-grade performance</h2>

    <div className="flex flex-col gap-10 md:flex-row md:gap-[52px] md:items-start w-full">
      <div className="flex flex-col gap-3 items-start shrink-0">
        <div className="flex items-end gap-2">
          <p className="font-sans-landing font-medium text-landing-text-100 text-[48px] leading-[60px] tracking-[-0.02em]">
            20x faster
          </p>
        </div>
        <p className={cn(bodyMedium, "w-[264px]")}>
          Laminar's trace compression means faster reads, faster writes, and lower storage costs
        </p>

        <LearnMoreLink href="https://laminar.sh/blog/laminar-20x-agent-trace-compression" label="Read more" />
      </div>

      <div className="flex flex-col gap-1 items-start pt-8 w-full md:flex-1 md:min-w-0">
        <motion.div
          className="bg-landing-surface-500 flex h-13 items-center justify-end px-3 overflow-hidden whitespace-nowrap w-full rounded-sm"
          initial={{ width: 0 }}
          whileInView={{ width: "100%" }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          <p className="text-sm text-landing-text-300">Competition</p>
        </motion.div>
        <div className="flex items-center gap-3 h-13 w-full">
          <motion.div
            className="bg-landing-primary-400 h-full rounded-sm"
            initial={{ width: 0 }}
            whileInView={{ width: "5%" }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 1 }}
          />
          <p className="text-sm text-landing-text-100">Laminar</p>
        </div>
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
