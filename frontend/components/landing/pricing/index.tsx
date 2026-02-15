"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";

import Footer from "@/components/landing/footer";
import LandingButton from "@/components/landing/landing-button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import PricingCalculator from "./pricing-calculator";
import PricingCard from "./pricing-card";
import type { PricingFeature } from "./pricing-card";

const tiers: {
  title: string;
  description: string;
  price: string;
  priceSuffix?: string;
  features: PricingFeature[];
  highlighted?: boolean;
  badge?: string;
  cta: { label: string; href: string };
  variant: "outline" | "primary";
}[] = [
  {
    title: "Free",
    description: "For individuals exploring observability",
    price: "$0",
    features: [
      { label: "1 GB data / month", value: "1 GB" },
      { label: "No data overage", value: "—" },
      { label: "15 day data retention", value: "15 days" },
      { label: "1 team member", value: "1" },
      { label: "1 project", value: "1" },
      { label: "100 signal runs / month", value: "100" },
      { label: "No signal overage", value: "—" },
      { label: "Community support", value: "Community" },
    ],
    cta: { label: "GET STARTED", href: "/projects" },
    variant: "outline",
  },
  {
    title: "Hobby",
    description: "For small teams building with LLMs",
    price: "$25",
    features: [
      { label: "3 GB data / month included", value: "3 GB", subtext: "then $2 per additional GB" },
      { label: "30 day data retention", value: "30 days" },
      { label: "Unlimited team members", value: "Unlimited" },
      { label: "Unlimited projects", value: "Unlimited" },
      { label: "1,000 signal runs / month", value: "1,000", subtext: "then $0.02 per additional run" },
      { label: "Priority email support", value: "Email" },
    ],
    cta: { label: "GET STARTED", href: "/projects" },
    variant: "outline",
  },
  {
    title: "Pro",
    description: "For scaling teams with production workloads",
    price: "$150",
    highlighted: true,
    badge: "Popular",
    features: [
      { label: "10 GB data / month included", value: "10 GB", subtext: "then $1.50 per additional GB" },
      { label: "90 day data retention", value: "90 days" },
      { label: "Unlimited team members", value: "Unlimited" },
      { label: "Unlimited projects", value: "Unlimited" },
      { label: "10,000 signal runs / month", value: "10,000", subtext: "then $0.015 per additional run" },
      { label: "Private Slack channel", value: "Slack" },
    ],
    cta: { label: "GET STARTED", href: "/projects" },
    variant: "primary",
  },
  {
    title: "Enterprise",
    description: "For organizations with custom needs",
    price: "Custom",
    priceSuffix: "",
    features: [
      { label: "Custom data volume", value: "Custom" },
      { label: "Custom data retention", value: "Custom" },
      { label: "Unlimited team members", value: "Unlimited" },
      { label: "Unlimited projects", value: "Unlimited" },
      { label: "Custom signal runs", value: "Custom" },
      { label: "On-premise deployment", value: "On-premise" },
      { label: "Dedicated support", value: "Dedicated" },
    ],
    cta: { label: "CONTACT US", href: "mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry" },
    variant: "outline",
  },
];

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
        "Data usage is calculated from text and image data processed in traces, evaluations, and datasets. Note that the pricing calculator does not take into account stored images and is an approximation of the total data usage.",
    },
    {
      id: "span",
      question: "What is a span?",
      answer:
        "A span represents a unit of work or operation in your application. In the context of tracing, a single LLM call or function tool call is a span. In the case of evaluations, executor runs and evaluator runs are spans.",
    },
    {
      id: "signal-run",
      question: "What is a signal run?",
      answer:
        "A signal run is a single execution of a signal pipeline. Signals allow you to define online evaluations that run automatically on your traces. Each time a signal pipeline processes a trace, it counts as one signal run.",
    },
    {
      id: "overage",
      question: "What happens when I exceed my included limits?",
      answer:
        "On the Hobby and Pro plans, you can continue using the platform beyond your included data and signal run limits. You'll be billed for overage at the per-unit rates shown in your plan. On the Free plan, usage is capped at the included limits.",
    },
  ];

  return (
    <div className="flex flex-col items-center pt-32 w-full h-full bg-landing-surface-800">
      {/* Header */}
      <div className="text-center max-w-2xl px-4 mb-12">
        <h1 className="text-4xl md:text-5xl font-semibold font-space-grotesk text-landing-text-100 tracking-tight">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-landing-text-300">
          Start free. Scale as you grow. Only pay for what you use.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:px-16 px-4 w-full max-w-7xl">
        {tiers.map((tier) => (
          <div
            key={tier.title}
            className={
              tier.highlighted
                ? "h-full w-full p-8 flex flex-col justify-between z-20 border border-landing-primary-400 bg-landing-primary-400 rounded-lg"
                : "p-8 border border-landing-surface-400 rounded-lg flex flex-col justify-between"
            }
          >
            <PricingCard
              className={tier.highlighted ? "z-20" : "text-landing-text-200"}
              title={tier.title}
              description={tier.description}
              price={tier.price}
              priceSuffix={tier.priceSuffix}
              features={tier.features}
              highlighted={tier.highlighted}
              badge={tier.badge}
            />
            <Link href={tier.cta.href} className={tier.highlighted ? "w-full z-20" : "w-full"}>
              <LandingButton
                variant={tier.variant}
                className={
                  tier.highlighted
                    ? "w-full bg-landing-text-100 text-landing-surface-900 hover:bg-landing-text-200"
                    : "w-full"
                }
              >
                {tier.cta.label}
              </LandingButton>
            </Link>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <div className="w-full max-w-7xl mt-24 px-4 md:px-16">
        <h2 className="text-2xl font-semibold mb-8 text-center font-space-grotesk text-landing-text-100">
          Compare plans
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-landing-surface-400">
                <th className="text-left py-4 pr-4 text-landing-text-300 font-medium w-1/5">Feature</th>
                <th className="text-center py-4 px-4 text-landing-text-100 font-semibold">Free</th>
                <th className="text-center py-4 px-4 text-landing-text-100 font-semibold">Hobby</th>
                <th className="text-center py-4 px-4 text-landing-text-100 font-semibold">Pro</th>
                <th className="text-center py-4 pl-4 text-landing-text-100 font-semibold">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Monthly price", values: ["$0", "$25", "$150", "Custom"] },
                { label: "Data included", values: ["1 GB", "3 GB", "10 GB", "Custom"] },
                { label: "Data overage", values: ["—", "$2 / GB", "$1.50 / GB", "Custom"] },
                { label: "Data retention", values: ["15 days", "30 days", "90 days", "Custom"] },
                { label: "Team members", values: ["1", "Unlimited", "Unlimited", "Unlimited"] },
                { label: "Projects", values: ["1", "Unlimited", "Unlimited", "Unlimited"] },
                { label: "Signal runs", values: ["100", "1,000", "10,000", "Custom"] },
                { label: "Signal overage", values: ["—", "$0.02 / run", "$0.015 / run", "Custom"] },
                { label: "Support", values: ["Community", "Email", "Slack", "Dedicated"] },
              ].map((row, i) => (
                <tr key={i} className="border-b border-landing-surface-400/50">
                  <td className="py-3 pr-4 text-landing-text-300 font-medium">{row.label}</td>
                  {row.values.map((val, j) => (
                    <td
                      key={j}
                      className={`py-3 px-4 text-center ${val === "—" ? "text-landing-text-600" : "text-landing-text-200"}`}
                    >
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Calculator Section */}
      <PricingCalculator />

      {/* FAQ */}
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
