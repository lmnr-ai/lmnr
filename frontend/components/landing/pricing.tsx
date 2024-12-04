'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { useState } from "react";

import noise from '@/assets/landing/noise1.jpeg';
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

  const [spanCount, setSpanCount] = useState(50);  // in thousands
  const [teamMembers, setTeamMembers] = useState(1);

  const calculateProPrice = () => {
    const basePrice = 25;
    const additionalSpansCost = spanCount > 50 ? Math.floor((spanCount - 50) / 100 * 25) : 0;
    const additionalMembersCost = (teamMembers - 1) * 25;
    return basePrice + additionalSpansCost + additionalMembersCost;
  };

  const handleQuestionClick = (question: string) => {
    posthog?.capture('faq_question_clicked', { question });
  };

  return (
    <div className="flex flex-col items-center mt-32 w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:p-16">
        <div className="p-8 border rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Free"
            price="0 / month"
            features={[
              '10K spans / month',
              '7 day data retention',
              '1 team member',
              'Community support'
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
        <div
          className="rounded relative"
        >
          <div className="absolute inset-0 z-10 overflow-hidden rounded-lg">
            <Image
              src={noise}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div className="bg-transparent h-full w-full rounded p-8 flex flex-col z-20">
            <PricingCard
              className="text-white z-20"
              title="Pro"
              price={`$${calculateProPrice()} / month`}
              features={[
                '50k spans / month included',
                '60 day data retention',
                '$25 / additional team member',
                'Priority support'
              ]}
              subfeatures={[
                'then $25 per 100k of additional spans',
                null,
                null,
                null
              ]}
            />
            <div className="space-y-4 z-20 flex flex-col">
              <div className="space-y-2">
                <div className="text-white">Spans per month {spanCount}k</div>
                <Slider
                  defaultValue={[50]}
                  max={1000}
                  min={50}
                  step={50}
                  onValueChange={(value) => setSpanCount(value[0])}
                />
              </div>
              <div className="space-y-2">
                <div className="text-white">Team members {teamMembers}</div>
                <Slider
                  defaultValue={[1]}
                  max={10}
                  min={1}
                  step={1}
                  onValueChange={(value) => setTeamMembers(value[0])}
                />
              </div>
              <Link href="/projects" className="w-full z-20">
                <Button
                  className="h-10 text-base bg-white/90 text-black hover:bg-white/70 w-full"
                  variant="outline"
                >
                  Get started
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="p-8 border rounded-lg flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Team"
            price="$300 / month"
            features={[
              '1M spans / month',
              '180 day data retention',
              '5 team members included',
              'Private Slack channel'
            ]}
            subfeatures={[
              null,
              null,
              'then $25 / additional team member',
              null
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
      </div>
      <div className="w-full max-w-3xl mt-16 mb-32 px-4">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger
              className="text-2xl"
              onClick={() => handleQuestionClick('What is a span?')}
            >
              What is a span?
            </AccordionTrigger>
            <AccordionContent className="text-secondary-foreground">
              A span represents a unit of work or operation in you application.
              In the context of tracing, single LLM call or function tool call
              is a span. In case of evaluations, executor run and evaluator run
              are spans.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="flex-grow"></div>
      <Footer />
    </div >
  );
}
