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
        "Data usage is calculated from text and image data processed in traces, evaluations, and datasets. Note that the pricing calculator does not take into account stored images and is an approximation of the total data usage.",
    },
    {
      id: "signal-run",
      question: "What is a signal run?",
      answer:
        "A signal run is a single execution of a signal job — for example, running an LLM-as-a-judge evaluator on one datapoint. The average cost per signal run is approximately $0.005.",
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
            features={["1 GB data", "100 signal runs", "15 day retention", "1 project / 1 seat", "Community support"]}
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
            price="$25 / month"
            featureClassName="text-landing-text-200"
            subfeatureClassName="text-landing-text-400"
            features={[
              "3 GB data",
              "1,000 signal runs",
              "30 day retention",
              "Unlimited projects / seats",
              "Email support",
            ]}
            subfeatures={["$2 / GB", "$0.02 / run", null, null, null]}
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
              "10 GB data",
              "10,000 signal runs",
              "90 day retention",
              "Unlimited projects / seats",
              "Slack support",
            ]}
            subfeatures={["$1.50 / GB", "$0.015 / run", null, null, null]}
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
            features={["Custom limits", "On-premise", "Unlimited projects / seats", "Dedicated support"]}
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
