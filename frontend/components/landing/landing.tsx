'use client';

import Image from 'next/image';
import yc from '@/assets/landing/yc.svg';
import traces from '@/assets/landing/traces.png';
import { ArrowRight, ArrowUpRight, Github } from 'lucide-react';
import smallTrace from '@/assets/landing/small-trace.png';
import moa from '@/assets/landing/MoA.png';
import palantir from '@/assets/landing/palantir.svg';
import amazon from '@/assets/landing/amazon.svg';
import github from '@/assets/landing/github-mark-white.svg';
import noise from '@/assets/landing/noise.png';

import Link from 'next/link';
import Footer from './footer';
import { Button } from '../ui/button';

export default function Landing() {
  return (
    <>
      {/* <div className="inset-0 backdrop-blur-lg fixed">
        <Image src={noise} alt="" className="opacity-20 w-full h-full" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-b from-transparent to-background pointer-events-none">
      </div> */}

      <div className="flex flex-col z-30 items-center space-y-16">
        <div className="flex flex-col md:w-[1000px] space-y-8">
          <div className="flex flex-col mt-28">
            {/* GitHub button */}
            <div className="flex w-full justify-center">
              <Link target="_blank" href="https://github.com/lmnr-ai/lmnr">
                <Button
                  className="h-10 text-sm bg-transparent border-white/20"
                  variant="outline"
                >
                  <Image
                    src={github}
                    alt="GitHub"
                    width={20}
                    height={20}
                    className="mr-2"
                  />
                  We are fully Open-Source. Star us on GitHub ⭐️
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Main content */}
            <div className="flex flex-col items-center space-y-8 pt-4 text-center">
              <p className="text-6xl px-2 md:px-0 md:text-7xl md:leading-tight text-white">
                LLM engineering <br /> from first principles
              </p>
              <p className="md:w-[560px] md:text-xl md:2xl:tracking-normal font-normal">
                Laminar is an open-source platform for engineering LLM products.
                Trace, evaluate, annotate, and analyze LLM data. Bring LLM
                applications to production with confidence.
              </p>
              <div className="flex space-x-4 items-center">
                <Link href="/projects">
                  <Button className="w-40 h-12 text-base" variant="default">
                    Get started
                  </Button>
                </Link>
                <Link target="_blank" href="https://docs.lmnr.ai">
                  <Button
                    className="w-40 h-12 text-base bg-transparent border-white/20"
                    variant="outline"
                  >
                    Read the docs
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Backed by and Made by sections */}
          <div className="flex flex-col items-center text-sm">
            <p>Backed by</p>
            <Image
              className="pt-4"
              src={yc}
              alt="backed by Y Combinator"
              width={180}
              height={200}
            />
          </div>
          <div className="pt-4 flex flex-col items-center">
            <p className="text-sm font-medium text-secondary-foreground">
              Made by the team from
            </p>
            <div className="flex space-x-8 mt-2">
              <Image
                src={palantir}
                alt="Palantir"
                width={120}
                height={40}
                className="opacity-80 transition-opacity"
              />
              <Image
                src={amazon}
                alt="Amazon"
                width={105}
                height={20}
                className="opacity-80 transition-opacity mt-2"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col md:items-center space-y-16 md:w-[1200px] md:px-0">
          <div className="flex flex-col space-y-4 w-full">
            <div className="bg-secondary w-full border rounded overflow-hidden shadow-lg">
              <Image
                alt="Traces visualization"
                src={traces}
                className="overflow-hidden rounded md:shadow-lg w-full h-full"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col md:items-center md:w-[1000px] px-8 md:px-0">
          <div>
            <p className="pb-8 text-3xl md:text-3xl text-center font-normal">
              Everything you need to understand <br /> and optimize your LLM
              application
            </p>
          </div>
          <div className="flex flex-col pt-8 w-full space-y-4">
            <div className="flex flex-col space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TracingCard />
                <EventsCard />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col space-y-4 md:col-span-1">
                <EvaluationsCard />
                <RustCard />
              </div>
              <div className="md:col-span-2 h-full">
                <PromptChainsCard className="h-full" />
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}

function TracingCard() {
  return (
    <div className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-secondary-foreground flex flex-col">
      <Link
        href="https://docs.lmnr.ai/tracing/introduction"
        className="flex flex-col h-full"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-xl font-normal">Full Tracing</h3>
          <p className="text-secondary-foreground/80 text-sm">
            Track and understand every step of execution in your LLM app by
            simply adding a few lines of code.
          </p>
          <div className="flex items-center mt-4">
            Start tracing <ArrowRight className="ml-2 h-4 w-4" />
          </div>
        </div>
        <div className="mt-auto px-6">
          <div className="flex rounded-t-lg overflow-hidden border-t border-r border-l">
            <Image
              src={smallTrace}
              alt="Tracing visualization"
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </Link>
    </div>
  );
}

function EventsCard() {
  return (
    <div className="p-6 h-full bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-secondary-foreground">
      <Link
        href="https://docs.lmnr.ai/events/introduction"
        className="flex flex-col h-full space-y-2"
      >
        <h3 className="text-xl font-normal">Semantic events</h3>
        <p className="text-secondary-foreground/80 text-sm">
          Have a clear understanding of how your LLM app is being used by
          tracking semantic events. Define events, such as user sentiment, in
          plain English. We will catch them in the background and turn them into
          metrics.
        </p>
        <div className="flex items-center mt-4">
          Learn about events <ArrowRight className="ml-2 h-4 w-4" />
        </div>
        <div className="flex flex-col space-y-4 p-4">
          <div className="z-30 flex">
            <EventCard title="USER_SENTIMENT" />
          </div>
          <div className="z-20 flex ml-8">
            <EventCard title="CORRECT_TOOL_USED" />
          </div>
          <div className="z-10 flex ml-16">
            <EventCard title="COMPREHENSION_SCORE" />
          </div>
        </div>
      </Link>
    </div>
  );
}

function EventCard({ title }: { title: string }) {
  return (
    <div className="bg-gradient-to-br to-transparent from-gray-500 rounded-lg p-[0.5px]">
      <div className="bg-[#1C1C21] rounded-lg p-3 text-center flex items-center space-x-2">
        <div className="rounded-full bg-orange-400 w-2 h-2" />{' '}
        <h4 className="text-sm  bg-gradient-to-r from-gray-400 via-white/90 to-gray-400 bg-clip-text text-transparent">
          {title}
        </h4>
      </div>
    </div>
  );
}

function EvaluationsCard() {
  return (
    <div className="p-6 bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-secondary-foreground">
      <Link
        href="https://docs.lmnr.ai/evaluations/introduction"
        className="space-y-2"
      >
        <h3 className="text-xl font-normal">Evaluations</h3>
        <p className="text-secondary-foreground/80 text-sm">
          Run custom evaluations at scale. Build custom evaluation pipelines,
          including LLM evaluations, and run them on custom datasets.
        </p>
        <div className="flex items-center mt-4">
          Discover evaluations <ArrowRight className="ml-2 h-4 w-4" />
        </div>
      </Link>
    </div>
  );
}

function RustCard() {
  return (
    <div className="space-y-2 p-6 bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-secondary-foreground h-full">
      <h3 className="text-xl font-normal">Powered by Rust 🦀</h3>
      <p className="text-secondary-foreground/80 text-sm">
        Rust allowed us to deliver unparalleled performance and reliability.
        Laminar can sustain high-throughput and effortlessly scale to processing
        of millions of tokens per second.
      </p>
    </div>
  );
}

function PromptChainsCard({ className }: { className?: string }) {
  return (
    <div
      className={`bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-secondary-foreground ${className}`}
    >
      <Link
        href="https://docs.lmnr.ai/pipeline/introduction"
        className="space-y-2 h-full flex flex-col"
      >
        <div className="flex-grow space-y-2 p-6">
          <h3 className="text-xl font-normal">Prompt chain management</h3>
          <p className="text-secondary-foreground/80 text-sm">
            Laminar lets you go beyond a single prompt. You can build and host
            complex chains, including mixtures of agents or self-relfecting LLM
            pipelines.
          </p>
          <div className="flex items-center mt-4">
            Learn about chains <ArrowRight className="ml-2 h-4 w-4" />
          </div>
        </div>
        <div className="mt-auto px-6">
          <div className="flex rounded-t-lg overflow-hidden border-t border-r border-l">
            <Image
              src={moa}
              alt="Prompt Chains visualization"
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </Link>
    </div>
  );
}
