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
      id: "signals-pricing",
      question: "How is Signals usage priced?",
      answer: (
        <>
          Signals are billed by the tokens the agent spends to read a trace and generate a structured event: $0.50 per
          1M input tokens and $3 per 1M output tokens. Each plan includes a dollar amount of Signals usage ($5 Free, $15
          Hobby, $50 Pro); usage past that is billed at the same per-token rates. You pay for what a Signal reads and
          writes, not for the spans your agent emits. Read more in the{" "}
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
      id: "signals-not-one-to-one",
      question: "Is this 1-to-1 with my agent's token usage?",
      answer:
        "No. Signals don't re-read your raw trace token-for-token. Laminar heavily compresses each trace and feeds a Signal only the parts it needs to produce its structured output, so the tokens you're billed for are a small fraction of the tokens your agent originally spent. The pricing calculator reflects this: move the trace-tokens slider and watch the much smaller Signals cost it produces.",
    },
    {
      id: "signals-consumption",
      question: "When is Signals usage consumed?",
      answer:
        "Signals run in two modes. Triggers run a Signal automatically on new traces that match your filters, which is useful for live dashboards and alerts. Jobs run a Signal across a historical slice of traces, which is useful to backfill a new Signal or re-evaluate a changed prompt. Both modes are billed by the same per-token rates. Trigger filters are AND-combined, so you can narrow which traces a Signal reads and only spend on the traces you care about.",
    },
    {
      id: "overage",
      question: "What happens if I exceed my plan's included usage?",
      answer:
        "Paid tiers keep working past their included allowance and bill overage at the per-GB data rate and the per-token Signals rates listed on each plan. The Free tier has no overage; once you hit its data cap or spend your included Signals budget, you'll need to upgrade to keep going. Enterprise has custom limits and rates negotiated per contract.",
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
