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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from "@/components/ui/slider";
import { toFixedIfFloat } from '@/lib/utils';

import PricingCard from './pricing-card';

function PricingCalculator() {
  const [tokens, setTokens] = useState(100_000_000);  // Default 100 million tokens
  const [teamMembers, setTeamMembers] = useState(1);
  const [agentSteps, setAgentSteps] = useState(500);  // agent steps per month

  // Convert tokens to GB (1 token = 3.5 bytes)
  const tokensToGB = (tokenCount: number) => {
    const bytes = tokenCount * 4;
    const gb = bytes / (1024 * 1024 * 1024); // Convert bytes to GB
    return gb;
  };

  // Logarithmic slider mapping
  const tokenRanges = [

    // Range 10M-100M: step 10M (9 positions: 14-22)
    { min: 10_000_000, max: 100_000_000, step: 10_000_000, positions: 9 },
    // Range 100M-1B: step 100M (9 positions: 23-31)
    { min: 100_000_000, max: 1_000_000_000, step: 50_000_000, positions: 20 },
    // Range 1B-10B: step 1B (9 positions: 32-40)
    { min: 1_000_000_000, max: 10_000_000_000, step: 1_000_000_000, positions: 10 }
  ];

  const positionToTokens = (position: number): number => {
    let currentPosition = 0;

    for (const range of tokenRanges) {
      if (position < currentPosition + range.positions) {
        const relativePosition = position - currentPosition;
        if (relativePosition === 0) {
          return range.min;
        }
        return range.min + (relativePosition * range.step);
      }
      currentPosition += range.positions;
    }

    // Fallback to max value
    return tokenRanges[tokenRanges.length - 1].max;
  };

  const tokensToPosition = (tokenValue: number): number => {
    let currentPosition = 0;

    for (const range of tokenRanges) {
      if (tokenValue <= range.max) {
        if (tokenValue <= range.min) {
          return currentPosition;
        }
        const relativeTokens = tokenValue - range.min;
        const relativePosition = Math.round(relativeTokens / range.step);
        return currentPosition + relativePosition;
      }
      currentPosition += range.positions;
    }

    // Fallback to max position
    return currentPosition - 1;
  };

  const maxPosition = tokenRanges.reduce((sum, range) => sum + range.positions, 0) - 1;
  const currentPosition = tokensToPosition(tokens);

  const calculateTierAndPrice = () => {
    const dataCount = tokensToGB(tokens); // Convert tokens to GB for calculation

    let breakdown = {
      baseTier: '',
      basePrice: 0,
      additionalData: 0,
      additionalMembers: 0,
      additionalSteps: 0,
      total: 0
    };

    // Free tier: 1GB data, 1 team member, 500 agent steps
    if (dataCount <= 1 && teamMembers <= 1 && agentSteps <= 500) {
      breakdown = {
        baseTier: 'Free',
        basePrice: 0,
        additionalData: 0,
        additionalMembers: 0,
        additionalSteps: 0,
        total: 0
      };
      return { tier: 'Free', price: 0, breakdown };
    }

    // Hobby tier: 2GB data, 2 team members, 2500 agent steps
    if (teamMembers <= 2) {
      const basePrice = 25;
      let additionalDataCost = 0;
      let additionalStepsCost = 0;

      // Additional data cost - changed to $2 per GB
      if (dataCount > 2) {
        additionalDataCost = (dataCount - 2) * 2;
      }

      // Additional agent steps cost
      if (agentSteps > 2500) {
        const additionalSteps = Math.ceil((agentSteps - 2500) / 100);
        additionalStepsCost = additionalSteps;
      }

      const total = basePrice + additionalDataCost + additionalStepsCost;

      breakdown = {
        baseTier: 'Hobby',
        basePrice,
        additionalData: additionalDataCost,
        additionalMembers: 0,
        additionalSteps: additionalStepsCost,
        total
      };

      return { tier: 'Hobby', price: total, breakdown };
    }

    // Pro tier: 5GB data, 5+ team members, 5000 agent steps
    const basePrice = 50;
    let additionalDataCost = 0;
    let additionalMembersCost = 0;
    let additionalStepsCost = 0;

    // Additional data cost - changed to $2 per GB
    if (dataCount > 5) {
      additionalDataCost = (dataCount - 5) * 2;
    }

    // Additional team members cost - changed to 5 included members
    if (teamMembers > 3) {
      additionalMembersCost = (teamMembers - 3) * 25;
    }

    // Additional agent steps cost
    if (agentSteps > 5000) {
      const additionalSteps = Math.ceil((agentSteps - 5000) / 100);
      additionalStepsCost = additionalSteps;
    }

    const total = basePrice + additionalDataCost + additionalMembersCost + additionalStepsCost;

    breakdown = {
      baseTier: 'Pro',
      basePrice,
      additionalData: additionalDataCost,
      additionalMembers: additionalMembersCost,
      additionalSteps: additionalStepsCost,
      total
    };

    return { tier: 'Pro', price: total, breakdown };
  };

  const { tier, price, breakdown } = calculateTierAndPrice();

  // Format tokens for display
  const formatTokens = (tokenCount: number) => {
    if (tokenCount >= 1_000_000_000) {
      return `${(tokenCount / 1_000_000_000).toFixed(tokenCount % 1_000_000_000 === 0 ? 0 : 1)}B`;
    }
    if (tokenCount >= 1_000_000) {
      return `${(tokenCount / 1_000_000).toFixed(tokenCount % 1_000_000 === 0 ? 0 : 1)}M`;
    }
    if (tokenCount >= 1_000) {
      return `${(tokenCount / 1_000).toFixed(tokenCount % 1_000 === 0 ? 0 : 1)}K`;
    }
    return tokenCount.toLocaleString();
  };

  // Calculate estimated GB for display
  const estimatedGB = tokensToGB(tokens);

  return (
    <div className="w-full max-w-2xl mt-16 px-4">
      <div className="p-8 border space-y-6">
        <div className="text-center space-y-2 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Pricing calculator</h3>
          <div className="flex justify-center items-center gap-2">
            <Badge
              variant={tier === 'Free' ? 'outline' : tier === 'Hobby' ? 'outlinePrimary' : 'default'}
              className="text-sm"
            >
              {tier}
            </Badge>
            <span className="text-2xl font-bold">
              ${toFixedIfFloat(price)} / month
            </span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Tokens per month</span>
              <span className="font-medium">{formatTokens(tokens)} tokens</span>
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              ≈ {toFixedIfFloat(estimatedGB)} GB
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              * Based on ~4 bytes per token (approximation, excludes stored images)
            </div>
            <Slider
              value={[currentPosition]}
              max={maxPosition}
              min={0}
              step={1}
              onValueChange={(value) => setTokens(positionToTokens(value[0]))}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Team members</span>
              <span className="font-medium">{teamMembers}</span>
            </div>
            <Slider
              value={[teamMembers]}
              max={10}
              min={1}
              step={1}
              onValueChange={(value) => setTeamMembers(value[0])}
              className="w-full"
            />
          </div>
        </div>
        {/* Pricing Breakdown */}
        {breakdown && (
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">Price Breakdown</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>{breakdown.baseTier} tier (base)</span>
                <span>${toFixedIfFloat(breakdown.basePrice)}</span>
              </div>

              {breakdown.additionalData > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Additional data ({toFixedIfFloat(breakdown.additionalData / 2)}GB)</span>
                  <span>+${toFixedIfFloat(breakdown.additionalData)}</span>
                </div>
              )}

              {breakdown.additionalMembers > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Additional team members ({teamMembers - 5})</span>
                  <span>+${toFixedIfFloat(breakdown.additionalMembers)}</span>
                </div>
              )}

              {breakdown.additionalSteps > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Additional agent steps ({Math.ceil((agentSteps - (tier === 'Hobby' ? 2500 : 5000)) / 100) * 100})</span>
                  <span>+${toFixedIfFloat(breakdown.additionalSteps)}</span>
                </div>
              )}

              {(breakdown.additionalData > 0 || breakdown.additionalMembers > 0 || breakdown.additionalSteps > 0) && (
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Total</span>
                  <span>${toFixedIfFloat(breakdown.total)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Pricing() {
  const posthog = usePostHog();

  const handleQuestionClick = (question: string) => {
    posthog?.capture('faq_question_clicked', { question });
  };

  // Add FAQ data
  const faqItems = [
    {
      id: 'data-calculation',
      question: 'How is data usage calculated?',
      answer: 'Data usage is calculated from text and image data processed in traces, evaluations, and datasets. Note that pricing calculator does not take into account stored images and is an approximation of the total data usage.'
    },
    {
      id: 'span',
      question: 'What is a span?',
      answer: 'A span represents a unit of work or operation in your application. In the context of tracing, single LLM call or function tool call is a span. In case of evaluations, executor run and evaluator run are spans.'
    },
  ];

  return (
    <div className="flex flex-col items-center mt-32 w-full h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 md:p-16">
        <div className="p-8 border flex flex-col justify-between">
          <PricingCard
            className="text-secondary-foreground"
            title="Free"
            price="0 / month"
            features={[
              '1GB data / month',
              '15 day data retention',
              '1 team member',
              'Community support',
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
        <div className="p-8 border flex flex-col justify-between">
          <PricingCard
            className="text-secondary-foreground"
            title="Hobby"
            price="$25 / month"
            features={[
              '2GB data / month included',
              '30 day data retention',
              '2 team members',
              'Priority email support',
            ]}
            subfeatures={[
              'then $2 per 1GB of additional data',
              null,
              null,
            ]}
          />
          <Link href="/projects">
            <Button variant="secondary" className="w-full h-10">
              Get started
            </Button>
          </Link>
        </div>
        <div className="h-full w-full p-8 flex flex-col justify-between z-20 border border-primary bg-primary">
          <PricingCard
            className="text-white z-20"
            title="Pro"
            price="$50 / month"
            features={[
              '5GB data / month included',
              '90 day data retention',
              '3 team members included',
              'Private Slack channel',
            ]}
            subfeatures={[
              'then $2 per 1GB of additional data',
              null,
              'then $25 per additional team member',
            ]}
          />
          <Link href="/projects" className="w-full z-20">
            <Button
              className="h-10 text-base bg-white/90 border-none text-primary hover:bg-white/70 w-full"
              variant="outline"
            >
              Get started
            </Button>
          </Link>
        </div>
        <div className="p-8 border flex flex-col justify-between">
          <PricingCard
            className="text-secondary-foreground"
            title="Enterprise"
            price="Custom"
            features={[
              'Custom data retention',
              'Custom team members',
              'On-premise deployment',
              'Dedicated support',
            ]}
          />
          <Link href="mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry">
            <Button variant="secondary" className="w-full h-10">
              Contact us
            </Button>
          </Link>
        </div>
      </div>

      {/* Calculator Section */}
      <PricingCalculator />

      <div className="w-full max-w-3xl mt-16 mb-32 px-4">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger
                className="text-xl"
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
