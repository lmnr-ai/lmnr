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

export default function Pricing() {
  const posthog = usePostHog();

  const handleQuestionClick = (question: string) => {
    posthog?.capture('faq_question_clicked', { question });
  };

  return (
    <div className="flex flex-col items-center mt-32 w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8 md:p-16">
        <div className="p-8 border rounded flex flex-col space-y-4">
          <PricingCard
            className="text-secondary-foreground"
            title="Free"
            price="0 / month"
            features={[
              '10K spans / month',
              '50K events / month',
              '7 day data retention',
              '2 team members',
              'Community support'
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full">
              Get started
            </Button>
          </Link>
        </div>
        <div
          className="bg-gradient-to-br from-white via-primary to-gray-500 rounded"
          style={{ padding: '1px' }}
        >
          <div className="bg-background h-full w-full rounded p-8 flex flex-col space-y-4">
            <PricingCard
              title="Pro"
              price="$25 / month"
              features={[
                '50k spans / month included',
                '100k events / month included',
                '60 day data retention',
                '3 team members',
                'Priority support'
              ]}
              subfeatures={[
                'then $25 per 100k of additional spans',
                'then $25 per 200k of additional events',
                null,
                '$20 / month per member'
              ]}
            />
            {/* <div className="text-secondary-foreground">$20 / month for each additional member</div> */}
            <Link href="/projects">
              <Button variant="secondary" className="w-full">
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
      <div className="w-full max-w-3xl mt-16 mb-8 px-4">
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
          <AccordionItem value="item-2">
            <AccordionTrigger
              className="text-2xl"
              onClick={() => handleQuestionClick('What are events?')}
            >
              What are events?
            </AccordionTrigger>
            <AccordionContent className="text-secondary-foreground">
              Events are discrete occurrences or actions within your application
              that you want to track. They can represent agent actions, tool
              calls and assertion errors.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="flex-grow"></div>
      <Footer />
    </div>
  );
}
