'use client';

import Image from 'next/image';
import yc from '@/assets/landing/yc.svg';
import traces from '@/assets/landing/traces.png';
import evals from '@/assets/landing/evals.png';
import labels from '@/assets/landing/labels.png';
import onlineEvals from '@/assets/landing/online-evals.png';

import { ArrowUpRight } from 'lucide-react';
import smallTrace from '@/assets/landing/small-trace.png';
import moa from '@/assets/landing/MoA.png';
import dataset from '@/assets/landing/dataset.png';
import palantir from '@/assets/landing/palantir.svg';
import amazon from '@/assets/landing/amazon.svg';
import github from '@/assets/landing/github-mark-white.svg';
import noise from '@/assets/landing/noise.jpeg';
import noise1 from '@/assets/landing/noise1.jpeg';

import Link from 'next/link';
import Footer from './footer';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CodeEditor from '../ui/code-editor';
import { useEffect, useState } from 'react';

export default function Landing() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/stars', { cache: 'no-cache' })
      .then(res => res.json())
      .then(data => setStars(data.stars))
      .catch(err => console.error('Failed to fetch GitHub stars:', err));
  }, []);

  const sections = [
    {
      id: 'traces',
      title: 'Traces',
      description: 'When you trace your LLM application, you get a clear picture of every step of execution and simultaneously collect invaluable data. You can use it to set up better evaluations, as dynamic few-shot examples, and for fine-tuning.',
      codeExample: `from lmnr import Laminar, observe

# automatically instruments common 
# LLM frameworks and libraries
Laminar.initialize(project_api_key="...")

@observe() # annotate all functions you want to trace
def my_function():
  ...
`,
      image: traces,
      docsLink: 'https://docs.lmnr.ai/tracing/introduction'
    },
    {
      id: 'evals',
      title: 'Evals',
      description: 'Evaluations are unit tests for your prompts. Without them, any iteration attempt is blind. Laminar gives you powerful tools to build and run evaluations to facilitate the iteration process. Run them from the code, terminal, or as a part of your CI/CD pipeline.',
      image: evals,
      codeExample: `from lmnr import evaluate

evaluate(
    data=[
        {
          "data": { ... },
          "target": { ... }
        },
    ],
    executor=my_function,
    evaluators={
      "accuracy": lambda output, target: ...
    }
)`,
      docsLink: 'https://docs.lmnr.ai/evaluations/introduction'
    },
    {
      id: 'labels',
      title: 'Labels',
      description: 'Labeling LLM outputs helps you identify exactly where your AI application succeeds or fails. Laminar helps you build labeled datasets, which you can use to fine-tune your models, add successful examples to your prompts, and fix problem areas.',
      image: labels,
      docsLink: 'https://docs.lmnr.ai/labels/introduction'
    }
  ];

  return (
    <>
      <div className="flex flex-col z-30 items-center space-y-16 pt-28">
        <div className="flex flex-col md:w-[1000px] space-y-8">
          <div className="flex flex-col">
            <div className="flex flex-col items-center pt-4 text-center relative">
              <div className="inset-0 absolute z-10 md:rounded-lg overflow-hidden">
                <Image src={noise} alt="" className="w-full h-full" priority />
              </div>
              <div className="z-20 flex flex-col items-center space-y-10 p-8">
                <p className="text-4xl tracking-tighter md:px-0 md:text-7xl md:leading-tight md:tracking-normal text-white font-medium"
                // style={{ fontFamily: 'var(--font-sans2)' }}
                >
                  AI engineering <br /> from first principles
                </p>
                <p className="text-[1.2rem] md:text-2xl md:w-[500px] md:tracking-normal font-medium text-white">
                  Laminar is an open-source all-in-one platform
                  for engineering best-in-class LLM products.
                </p>
                <div className="flex w-full justify-center">
                  <Link target="_blank" href="https://github.com/lmnr-ai/lmnr">
                    <Button
                      className="h-10 bg-white/10 border-white text-white hover:bg-white/20"
                      variant="outline"
                    >
                      <Image
                        src={github}
                        alt="GitHub"
                        width={20}
                        height={20}
                        className="mr-2"
                      />
                      Star us on GitHub {stars && `★ ${stars}`}
                      <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <div className="flex space-x-4 items-center">
                  <Link href="/sign-in">
                    <Button className="w-40 h-12 text-base bg-white/90 text-black hover:bg-white/70">
                      Get started
                    </Button>
                  </Link>
                  <Link target="_blank" href="https://docs.lmnr.ai">
                    <Button
                      className="w-40 h-12 text-base bg-transparent border-white text-white hover:bg-white/10"
                      variant="outline"
                    >
                      Read the docs
                    </Button>
                  </Link>
                </div>
                <div className="flex justify-center items-center text-sm space-x-8">
                  <Image
                    src={yc}
                    alt="backed by Y Combinator"
                    className="w-28 md:w-36"
                  />
                  <Image
                    src={palantir}
                    alt="Palantir"
                    className="w-20 md:w-24"
                  />
                  <Image
                    src={amazon}
                    alt="Amazon"
                    className="w-16 md:w-24 mt-3"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:items-center md:w-[1000px] md:px-0">
          <p
            className="text-center text-2xl px-8 md:my-16 font-medium md:text-4xl md:leading-relaxed text-white"
          >
            Data governs the quality of your LLM application. <br />
            Laminar helps you collect it, understand it, and use it.
          </p>
        </div>

        <div className="flex flex-col md:items-center space-y-16 md:w-[1000px] md:px-0">
          <Tabs
            defaultValue="traces"
            className="w-full"
          >
            <div className="flex flex-col space-y-4 w-full relative mb-8">
              <div className="absolute inset-0 z-0 md:rounded-lg overflow-hidden">
                <Image
                  src={noise1}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="z-20 text-white">
                <TabsList
                  className="flex justify-center border-none mb-8"
                >
                  {
                    sections.map((section, i) => (
                      <TabsTrigger key={i} value={section.id}
                        className="border-none data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white data-[state=inactive]:font-medium h-8 px-2 rounded">
                        {section.title}
                      </TabsTrigger>
                    ))
                  }
                </TabsList>
                {
                  sections.map((section, i) => (
                    <TabsContent key={i} value={section.id}>
                      <div className="flex-col w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-4 p-8">
                          <h1 className="text-4xl font-semibold">
                            {section.title}
                          </h1>
                          <p className="leading-tight font-medium text-lg text-white/90">
                            {section.description}
                          </p>
                          {section.docsLink && (
                            <div className="flex flex-col space-y-2 justify-start">
                              <Link
                                href={section.docsLink}
                                target="_blank"
                                className="text-white/90 flex items-center mt-4 border border-white/80 rounded-lg p-2"
                              >
                                Read more about {section.title.toLowerCase()} <ArrowUpRight className="ml-2 h-4 w-4" />
                              </Link>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col w-full">
                          {section.codeExample && (
                            <CodeEditor
                              background="bg-black"
                              className="bg-black md:rounded-tl-lg md:rounded-br-lg border-white"
                              value={section.codeExample}
                              language="python"
                              editable={false}
                            />
                          )}
                        </div>
                      </div>
                    </TabsContent>
                  ))
                }
              </div>
            </div>
            <div>
              {
                sections.map((section, i) => (
                  <TabsContent key={i} value={section.id}>
                    <div className="bg-secondary border rounded overflow-hidden w-full">
                      <Image
                        alt={section.title}
                        src={section.image}
                        className="overflow-hidden rounded md:shadow-lg w-full h-full"
                      />
                    </div>
                  </TabsContent>
                ))
              }
            </div>
          </Tabs>
        </div>
        <div className="flex flex-col md:items-center md:w-[1000px] px-4 md:px-0">
          <div className="flex flex-col w-full space-y-4">
            <div className="flex flex-col space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TracingCard />
                <EvaluationsCard />

              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col">
                <DatasetCard />
              </div>
              <div className="md:col-span-2 h-full">
                <PromptChainsCard className="h-full" />
              </div>
            </div>
            <SelfHostCard />
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}

function TracingCard() {
  return (
    <div
      className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Image
          src={noise1}
          alt=""
          className="w-full h-full object-cover object-top"
        />
      </div>
      <Link
        href="https://docs.lmnr.ai/tracing/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h1 className="text-xl font-medium group-hover:text-white transition-colors duration-200">Zero-overhead observability</h1>
          <p className="text-secondary-foreground/80 text-sm group-hover:text-white transition-colors duration-200">
            All traces are sent in the background via gRPC with minimal overhead.
            Tracing of text and image models is supported, audio models are coming soon.
          </p>
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Start tracing <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="mt-auto px-6">
          <div className="flex rounded-t-lg overflow-hidden border-t border-r border-l">
            <Image
              src={smallTrace}
              alt="Tracing visualization"
              className="w-full max-h-[200px] object-cover object-top"
            />
          </div>
        </div>
      </Link>
    </div>
  );
}

function DatasetCard() {
  return (
    <div className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Image
          src={noise1}
          alt=""
          className="w-full h-full object-cover object-top"
        />
      </div>
      <Link
        href="https://docs.lmnr.ai/datasets/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-xl font-medium group-hover:text-white transition-colors duration-200">Datasets</h3>
          <p className="text-secondary-foreground/80 text-sm group-hover:text-white transition-colors duration-200">
            You can build datasets from your traces, and use them in evaluations, fine-tuning and prompt engineering.
          </p>
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Create a dataset <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="mt-auto">
          <div className="flex overflow-hidden border-t">
            <Image
              src={dataset}
              alt="Dataset visualization"
              className="w-full object-cover object-top max-h-[215px]"
            />
          </div>
        </div>
      </Link>
    </div>
  );
}

function EvaluationsCard() {
  return (
    <div className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Image
          src={noise1}
          alt=""
          className="w-full h-full object-cover object-top"
        />
      </div>
      <Link
        href="https://docs.lmnr.ai/evaluations/online-evaluations"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-xl font-medium group-hover:text-white transition-colors duration-200">Online evaluations</h3>
          <p className="text-secondary-foreground/80 text-sm group-hover:text-white transition-colors duration-200">
            You can setup LLM-as-a-judge or Python script evaluators to run on each received span. Evaluators label spans, which is more scalable than human labeling, and especially helpful for smaller teams.
          </p>
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Setup online evaluations <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="mt-auto px-6">
          <div className="flex rounded-t-lg overflow-hidden border-t border-r border-l">
            <Image
              src={onlineEvals}
              alt="Online evaluations"
              className="w-full max-h-[200px] object-cover object-top"
            />
          </div>
        </div>
      </Link>
    </div>
  );
}

function PromptChainsCard({ className }: { className?: string }) {
  return (
    <div className={`bg-secondary/30 text-white border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group ${className}`}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Image
          src={noise1}
          alt=""
          className="w-full h-full object-cover object-top"
        />
      </div>
      <Link
        href="https://docs.lmnr.ai/pipeline/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-xl font-medium">Prompt chain management</h3>
          <p className="text-secondary-foreground/80 text-sm group-hover:text-white transition-colors duration-200">
            Laminar lets you go beyond a single prompt. You can build and host
            complex chains, including mixtures of agents or self-reflecting LLM
            pipelines.
          </p>
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Build LLM chains <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
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

function SelfHostCard() {
  return (
    <div className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Image
          src={noise1}
          alt=""
          className="w-full h-full object-cover object-top"
        />
      </div>
      <Link
        href="https://github.com/lmnr-ai/lmnr"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-xl font-medium group-hover:text-white transition-colors duration-200">Fully open-source</h3>
          <p className="text-secondary-foreground/80 text-sm group-hover:text-white transition-colors duration-200">
            Laminar is fully open-source and easy to self-host. Get started with just a few commands.
          </p>
          <CodeEditor
            className="p-0 max-h-[70px]"
            value={`git clone https://github.com/lmnr-ai/lmnr
cd lmnr
docker compose up -d`}
            background="bg-transparent"
            editable={false}
          />
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Learn about self-hosting <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
