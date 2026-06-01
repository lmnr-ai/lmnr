"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { bodyMedium } from "../../class-names";
import LearnMoreLink from "../two-lines-to-integrate/learn-more-link";

// FLAG: "Read more" needs a real destination — once we publish a compression
// deep-dive, swap `/blog` for that post.

const BuiltForProduction = () => (
  <section className="flex flex-col items-start w-full">
    <div className="flex flex-col gap-10 w-full">
      <p className="font-sans-landing font-medium text-landing-text-100 text-[48px] leading-[60px] tracking-[-0.02em]">
        20x more efficient storage
      </p>

      <div className="flex flex-col gap-10 md:flex-row md:gap-17 md:items-start w-full">
        <div className="flex flex-col gap-3 items-start shrink-0">
          <p className={cn(bodyMedium, "w-[320px]")}>
            Laminar stores only the unique content in agent runs, leading to faster ingestion and 20x cheaper storage.
          </p>

          <LearnMoreLink href="https://laminar.sh/blog/laminar-20x-agent-trace-compression" label="Read more" />
        </div>

        <div className="flex flex-col gap-1 items-start w-full md:flex-1 md:min-w-0">
          <motion.div
            className="flex h-11 items-center justify-end px-5 overflow-hidden whitespace-nowrap w-full rounded-sm bg-landing-surface-500 text-landing-text-100"
            initial={{ width: 0 }}
            whileInView={{ width: "100%" }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <p className="font-medium">Competition</p>
          </motion.div>
          <div className="flex items-center gap-3 h-11 w-full">
            <motion.div
              className="flex h-full items-center justify-end px-5 overflow-hidden whitespace-nowrap rounded-sm bg-landing-primary-300 text-background"
              initial={{ width: 0 }}
              whileInView={{ width: "5%" }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
            <p className="text-landing-text-100">Laminar</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
