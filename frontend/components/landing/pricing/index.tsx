"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";

import Footer from "@/components/landing/footer";
import LandingButton from "@/components/landing/landing-button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import PricingCalculator from "./pricing-calculator";
import PricingCard from "./pricing-card";

export default function Pricing() {
  const posthog = usePostHog();

  const handleQuestionClick = (question: string) => {
    posthog?.capture("faq_question_clicked", { question });
  };

  // Add FAQ data
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
            className="underline hover:text-landing-text-100"
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
    <div className="flex flex-col items-center pt-32 w-full h-full bg-landing-surface-800">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:p-16">
        <div className="p-8 border border-landing-surface-400 rounded-lg flex flex-col justify-between">
          <PricingCard
            className="text-landing-text-200"
            title="Free"
            price="$0 / month"
            featureClassName="text-landing-text-200"
            subfeatureClassName="text-landing-text-400"
            features={[
              "1 GB data",
              "1,000 Signals steps processing",
              "15 day retention",
              "1 project",
              "1 seat",
              "Community support",
            ]}
            subfeatures={["no overage", "no overage", null, null, null, null]}
          />
          <Link href="/projects">
            <LandingButton variant="outline" className="w-full">
              GET STARTED
            </LandingButton>
          </Link>
        </div>
        <div className="p-8 border border-landing-surface-400 rounded-lg flex flex-col justify-between">
          <PricingCard
            className="text-landing-text-200"
            title="Hobby"
            price="$30 / month"
            featureClassName="text-landing-text-200"
            subfeatureClassName="text-landing-text-400"
            features={[
              "3 GB data included",
              "5,000 Signals steps processing included",
              "30 day retention",
              "Unlimited projects",
              "Unlimited seats",
              "Email support",
            ]}
            subfeatures={["then $2 / GB", "then $0.0075 / Signals step", null, null, null, null]}
          />
          <Link href="/projects">
            <LandingButton variant="outline" className="w-full">
              GET STARTED
            </LandingButton>
          </Link>
        </div>
        <div className="h-full w-full p-8 flex flex-col justify-between z-20 border border-landing-primary-400 bg-landing-primary-400 rounded-lg">
          <PricingCard
            className="z-20"
            title="Pro"
            price="$150 / month"
            titleClassName="text-landing-text-100"
            featureClassName="text-landing-text-100"
            subfeatureClassName="text-landing-text-100"
            features={[
              "10 GB data included",
              "50,000 Signals steps processing included",
              "90 day retention",
              "Unlimited projects",
              "Unlimited seats",
              "Slack support",
            ]}
            subfeatures={["then $1.50 / GB", "then $0.005 / Signals step", null, null, null, null]}
          />
          <Link href="/projects" className="w-full z-20">
            <LandingButton
              variant="primary"
              className="w-full bg-landing-text-100 text-landing-surface-900 hover:bg-landing-text-200"
            >
              GET STARTED
            </LandingButton>
          </Link>
        </div>
        <div className="p-8 border border-landing-surface-400 rounded-lg flex flex-col justify-between">
          <PricingCard
            className="text-landing-text-200"
            title="Enterprise"
            price="Custom"
            featureClassName="text-landing-text-200"
            subfeatureClassName="text-landing-text-400"
            features={["Custom limits", "On-premise", "Unlimited projects", "Unlimited seats", "Dedicated support"]}
          />
          <Link href="mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry">
            <LandingButton variant="outline" className="w-full">
              CONTACT US
            </LandingButton>
          </Link>
        </div>
      </div>

      {/* Calculator Section */}
      <PricingCalculator />

      <div className="w-full max-w-3xl mt-[180px] mb-32 px-4">
        <h2 className="text-2xl font-semibold mb-6 text-center font-space-grotesk text-landing-text-100">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item) => (
            <AccordionItem key={item.id} value={item.id} className="border-landing-surface-400">
              <AccordionTrigger
                className="text-xl text-landing-text-100"
                onClick={() => handleQuestionClick(item.question)}
              >
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-landing-text-200">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      <div className="grow"></div>
      <Footer />
    </div>
  );
}
