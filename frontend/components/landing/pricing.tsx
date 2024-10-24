'use client';

import { Button } from '@/components/ui/button';
import Footer from '@/components/landing/footer';
import PricingCard from './pricing-card';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { usePostHog } from 'posthog-js/react';
import Image from 'next/image';
import noise from '@/assets/landing/noise1.jpeg';

export default function Pricing() {
  const posthog = usePostHog();

  const handleQuestionClick = (question: string) => {
    posthog?.capture('faq_question_clicked', { question });
  };

  return (
    <div className="flex flex-col items-center mt-32 w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 md:p-16">
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
          <div className="bg-transparent h-full w-full rounded p-8 flex flex-col space-y-4 z-20">
            <PricingCard
              className="text-white z-20"
              title="Pro"
              price="$25 / month"
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
            {/* <div className="text-secondary-foreground">$20 / month for each additional member</div> */}
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
        {/* <div className="p-8 border-2 rounded flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Enterprise"
            description="Build cutting-edge products on Laminar"
            price="Custom"
            features={[
              "Custom",
              "10 projects / workspace",
              "1M pipeline runs / month",
              "1000MB storage",
              "90 day log retention",
              "5 members per workspace",
            ]}
          />
          <div className="text-secondary-foreground">$20 / month for each additional member</div>
          <a target="_blank" href="https://cal.com/skull8888888/30min">
            <Button variant="secondary" className="w-full">
              Book a demo
            </Button>
          </a>
        </div> */}
        {/* <div className="p-8 border-2 rounded flex flex-col space-y-4 flex-1">
          <PricingCard
            title="Enterprise"
            description="Perfect for large-scale businesses"
            price="Custom"
            features={[
              "Unlimited workspaces",
              "Unlimited projects",
              "Unlimited pipeline runs / month",
              "Configurable storage size",
              "Configurable number of collaborators",
              "Configurable log retention period",
              "Unlimited code generations per month",
            ]} />
          <Button variant={'secondary'} className="w-full">
            Contact us
          </Button>
        </div> */}
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
