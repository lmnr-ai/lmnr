"use client";

import { usePostHog } from "posthog-js/react";

import Footer from "@/components/landing/footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

import { bodyMedium, LANDING_COLUMN_MAX_W, subSection } from "../class-names";
import Divider from "../sections/divider";
import CardsVariant from "./cards-variant";
import PricingCalculator from "./pricing-calculator";
import PricingTable from "./pricing-table";

export default function Pricing() {
  const posthog = usePostHog();

  const handleQuestionClick = (question: string) => {
    posthog?.capture("faq_question_clicked", { question });
  };

  const faqItems = [
    {
      id: "data-calculation",
      question: "How is data usage calculated?",
      answer:
        "Data usage is the total text and image bytes Laminar stores for you across traces, evaluations, and datasets. Billing applies to bytes beyond your tier's included allowance. You are never charged for your agent's own span volume, only for the data you send us to store. The pricing calculator approximates data from token counts (roughly 3 bytes per token) and does not account for stored images, so treat the estimate as a lower bound.",
    },
    {
      id: "signals-step",
      question: "What is a Signals step?",
      answer: (
        <>
          A Signals step is one LLM call inside a trace that a Signal reads when it evaluates that trace. Each Signal is
          a plain-language prompt plus a structured output schema; when it runs on a trace, Laminar re-reads the
          underlying LLM calls (steps) to produce a structured event. You pay for the steps processed by Signals, not
          for the spans your agent emits. Read more in the{" "}
          <a
            href="https://laminar.sh/docs/signals/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground-50"
          >
            Signals docs
          </a>
          {"."}
        </>
      ),
    },
    {
      id: "signals-step-consumption",
      question: "When are Signals steps consumed?",
      answer:
        "Signals run in two modes. Triggers run a Signal automatically on new traces that match your filters, which is useful for live dashboards and alerts. Jobs run a Signal across a historical slice of traces, which is useful to backfill a new Signal or re-evaluate a changed prompt. Both modes consume Signals steps from your plan at the same rate. Trigger filters are AND-combined, so you can narrow down which traces a Signal reads and only spend steps on the traces you care about.",
    },
    {
      id: "overage",
      question: "What happens if I exceed my plan's included usage?",
      answer:
        "Paid tiers keep working past their included allowance and bill overage at the per-GB and per-Signals-step rates listed on each plan. The Free tier has no overage; once you hit its data or Signals-step cap, you'll need to upgrade to keep ingesting. Enterprise has custom limits and rates negotiated per contract.",
    },
  ];

  return (
    <div className="flex flex-col w-full overflow-x-clip">
      <div className="flex flex-col items-center w-full px-6 lg:px-0 pt-[180px] pb-[72px] md:pb-[120px]">
        <div className={cn("flex flex-col items-center w-full max-w-[1100px]")}>
          {/* Tier cards */}
          <div className="w-full mb-[160px]">
            <CardsVariant />
          </div>

          {/* Detailed comparison table */}
          <div className="w-full mb-[240px]">
            <PricingTable />
          </div>

          {/* Calculator */}
          <div className="w-full max-w-[640px] mb-[160px]">
            <PricingCalculator />
          </div>

          <div className={cn("w-full", LANDING_COLUMN_MAX_W)}>
            <Divider />
          </div>

          {/* FAQ — constrained to the landing column */}
          <div className={cn("w-full mt-[160px] flex flex-col gap-10", LANDING_COLUMN_MAX_W)}>
            <h2 className={cn(subSection, "text-white")}>Frequently asked questions</h2>
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item) => (
                <AccordionItem key={item.id} value={item.id} className="border-surface-400">
                  <AccordionTrigger
                    className={cn("text-white text-lg leading-6 py-6")}
                    onClick={() => handleQuestionClick(item.question)}
                  >
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className={cn(bodyMedium, "text-base pb-6")}>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
