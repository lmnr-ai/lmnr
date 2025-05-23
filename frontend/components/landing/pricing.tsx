'use client';

import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { useState } from "react";

import Footer from '@/components/landing/footer';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Slider } from "@/components/ui/slider";

import PricingCard from './pricing-card';

export default function Pricing() {
  const posthog = usePostHog();

  const [spanCount, setSpanCount] = useState(200);  // in thousands
  const [teamMembers, setTeamMembers] = useState(3);

  const calculateProPrice = () => {
    const basePrice = 50;
    const additionalSpansCost = spanCount > 200 ? Math.floor((spanCount - 200) / 100 * 5) : 0;
    const additionalMembersCost = (teamMembers - 3) * 25;
    return basePrice + additionalSpansCost + additionalMembersCost;
  };

  const handleQuestionClick = (question: string) => {
    posthog?.capture('faq_question_clicked', { question });
  };

  // Add FAQ data
  const faqItems = [
    {
      id: 'span',
      question: 'What is a span?',
      answer: 'A span represents a unit of work or operation in your application. In the context of tracing, single LLM call or function tool call is a span. In case of evaluations, executor run and evaluator run are spans.'
    },
    {
      id: 'agent-steps',
      question: 'What is an agent step?',
      answer: 'An agent step is a single step of an execution of the Index browser agent when it is called via API.'
    }
  ];

  return (
    <div className="flex flex-col items-center mt-32 w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:p-16">
        <div className="p-8 border rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Free"
            price="0 / month"
            features={[
              '50K spans / month',
              '15 day data retention',
              '1 team member',
              '500 Index agent steps / month',
              'Community support',
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
        <div className="p-8 border rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Hobby"
            price="$25 / month"
            features={[
              '100k spans / month',
              '30 day data retention',
              '2 team members',
              '2500 Index agent steps / month',
              'Priority email support',
            ]}
            subfeatures={[
              'then $5 per 100k of additional spans',
              null,
              null,
              'then $10 per 1k steps'
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
        <div className="h-full w-full rounded p-8 flex flex-col z-20 border border-primary bg-primary">
          <PricingCard
            className="text-white z-20"
            title="Pro"
            price={`$${calculateProPrice()} / month`}
            features={[
              '200k spans / month included',
              '90 day data retention',
              '3 team members included',
              '5000 Index agent steps / month',
              'Private Slack channel',
            ]}
            subfeatures={[
              'then $5 per 100k of additional spans',
              null,
              'then $25 per additional team member',
              'then $10 per 1k steps'
            ]}
          />
          <div className="space-y-4 z-20 flex flex-col">
            <div className="space-y-2">
              <div className="text-white">Spans per month {spanCount}k</div>
              <Slider
                defaultValue={[200]}
                max={1000}
                min={200}
                step={100}
                onValueChange={(value) => setSpanCount(value[0])}
              />
            </div>
            <div className="space-y-2">
              <div className="text-white">Team members {teamMembers}</div>
              <Slider
                defaultValue={[3]}
                max={10}
                min={3}
                step={1}
                onValueChange={(value) => setTeamMembers(value[0])}
              />
            </div>
            <Link href="/projects" className="w-full z-20">
              <Button
                className="h-10 text-base bg-white/90 border-none text-primary hover:bg-white/70 w-full"
                variant="outline"
              >
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </div>
      <div className="w-full max-w-3xl mt-16 mb-32 px-4">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger
                className="text-2xl"
                onClick={() => handleQuestionClick(item.question)}
              >
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-secondary-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      <div className="flex-grow"></div>
      <Footer />
    </div >
  );
}
