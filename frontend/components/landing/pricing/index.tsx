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
        "Data usage is calculated from text and image data processed in traces, evaluations, and datasets. Note that pricing calculator does not take into account stored images and is an approximation of the total data usage.",
    },
    {
      id: "span",
      question: "What is a span?",
      answer:
        "A span represents a unit of work or operation in your application. In the context of tracing, single LLM call or function tool call is a span. In case of evaluations, executor run and evaluator run are spans.",
    },
  ];

  return (
    <div className="flex flex-col items-center pt-32 w-full h-full bg-landing-surface-800">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:p-16">
        <div className="p-8 border border-landing-surface-400 rounded-lg flex flex-col justify-between">
          <PricingCard
            className="text-landing-text-200"
            title="Free"
            price="0 / month"
            featureClassName="text-landing-text-200"
            subfeatureClassName="text-landing-text-400"
            features={["1GB data / month", "15 day data retention", "1 team member", "Community support"]}
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
              "2GB data / month included",
              "30 day data retention",
              "2 team members",
              "Priority email support",
            ]}
            subfeatures={["then $2 per 1GB of additional data", null, null]}
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
            price="$50 / month"
            titleClassName="text-landing-text-100"
            featureClassName="text-landing-text-100"
            subfeatureClassName="text-landing-text-100"
            features={[
              "5GB data / month included",
              "90 day data retention",
              "3 team members included",
              "Private Slack channel",
            ]}
            subfeatures={["then $2 per 1GB of additional data", null, "then $25 per additional team member"]}
          />
          <Link href="/projects" className="w-full z-20">
            <LandingButton variant="primary" className="w-full bg-landing-text-100 text-landing-surface-900 hover:bg-landing-text-200">
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
            features={["Custom data retention", "Custom team members", "On-premise deployment", "Dedicated support"]}
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
