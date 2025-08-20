"use client";

import { ArrowUpRight } from "lucide-react";
import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";

import browserAgentObservability from "@/assets/landing/browser-agent-observability.png";
import clarum from "@/assets/landing/companies/clarum.png";
import remo from "@/assets/landing/companies/remo.svg";
import saturn from "@/assets/landing/companies/saturn.png";
import evals from "@/assets/landing/evals.png";
import query from "@/assets/landing/query.png";
import iterate from "@/assets/landing/iterate.png";
import observe from "@/assets/landing/observe.png";
import labeling from "@/assets/landing/labeling.png";
import playground from "@/assets/landing/playground.png";
import traces from "@/assets/landing/traces.png";
import yc from "@/assets/landing/yc.svg";
import { IconBrowserUse, IconPlaywright } from "@/components/ui/icons";
import { SpanType } from "@/lib/traces/types";

import FrameworksGrid from "../integrations/frameworks-grid";
import SpanTypeIcon from "../traces/span-type-icon";
import { Button } from "../ui/button";
import Footer from "./footer";
import FeatureCard from "./feature-card";

interface Section {
  id: string;
  title: string;
  description: string;
  pythonCodeExample?: string;
  tsCodeExample?: string;
  docsLink: string;
  callToAction: string;
  image: StaticImageData;
  isNew?: boolean;
}

const sections: Section[] = [
  {
    id: "traces",
    title: "Observability",
    description: `Tracing is the most crucial component in debugging and improving your AI app. It brings visibility into every
    execution step while collecting valuable data for evaluations and fine-tuning.
    With Laminar, you can start tracing with a single line of code.`,
    pythonCodeExample: `from lmnr import Laminar, observe

# automatically traces common LLM frameworks and SDKs
Laminar.initialize(project_api_key="...")

@observe() # you can also manually trace any function
def my_function(...):
    ...

`,
    tsCodeExample: `import { Laminar, observe } from '@lmnr-ai/lmnr';

// automatically traces common LLM frameworks and SDKs
Laminar.initialize({ projectApiKey: "..." });

// you can also manually trace any function
const myFunction = observe({name: 'myFunc'}, async () => {
...
})`,
    image: traces,
    docsLink: "https://docs.lmnr.ai/tracing/introduction",
    callToAction: "Start tracing your LLM app",
  },
  {
    id: "evals",
    title: "Evals",
    description: `Evals are unit tests for your AI app. 
    They help you answer questions like "Did my last change improve the performance?".
    With Laminar, you can run custom evals via code, CLI, or CI/CD pipeline.`,
    image: evals,
    pythonCodeExample: `from lmnr import evaluate

evaluate(
  data=[ ... ],
  executor=my_function,
  evaluators={
    "accuracy": lambda output, target: ...
  }
)`,
    tsCodeExample: `import { evaluate } from '@lmnr-ai/lmnr';

evaluate({
  data: [ ... ],
  executor: myFunction,
  evaluators: {
      accuracy: (output, target) => ...
  }
});`,
    docsLink: "https://docs.lmnr.ai/evaluations/introduction",
    callToAction: "Bring rigor to your LLM app",
  },
  {
    id: "playground",
    title: "Playground",
    description: `Playground is a tool that allows you to test your LLM app.`,
    image: playground,
    docsLink: "https://docs.lmnr.ai/playground/introduction",
    callToAction: "Try out Laminar Playground",
  },
  {
    id: "labeling",
    title: "Labeling",
    description: `Labeling is a tool that allows you to label your data.`,
    image: labeling,
    docsLink: "https://docs.lmnr.ai/labeling/introduction",
    callToAction: "Label your data",
  },
];

export default function Landing() {
  const [selectedSection, setSelectedSection] = useState<Section>(sections[0]);
  const [autoRotate, setAutoRotate] = useState(true);

  const handleSectionSelect = (section: Section) => {
    setSelectedSection(section);
    setAutoRotate(false);
    setTimeout(() => setAutoRotate(true), 10000);
  };

  useEffect(() => {
    if (!autoRotate) return;

    const timer = setInterval(() => {
      setSelectedSection((current) => {
        const currentIndex = sections.findIndex((section) => section.id === current.id);
        const nextIndex = (currentIndex + 1) % sections.length;
        return sections[nextIndex];
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [autoRotate]);

  return (
    <>
      <div className="flex flex-col z-30 items-center pt-28 space-y-8">
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] space-y-8">
          <div className="flex flex-col">
            <div className="flex flex-col items-center py-6 md:py-16 text-center relative">
              <div className="z-20 flex flex-col items-center gap-4 md:gap-6">
                <p className="text-[2.4rem] leading-tight tracking-tight md:text-[3.5rem] md:leading-tight text-white font-semibold animate-in fade-in duration-500 font-title">
                  How developers <br className="md:hidden" />{" "}
                  <span className="">build reliable AI agents.</span>
                </p>
                <p className="text-2xl text-white/85 font-semibold tracking-normal px-2 md:px-0 font-title">
                  The single open-source platform to trace, evaluate, and analyze AI agents.
                </p>
                <div className="flex space-x-4 items-center">
                  <Link href="/sign-up">
                    <Button className="w-40 h-12 text-base">Get started - free</Button>
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
                <div className="flex justify-center items-center gap-4 flex-col mt-2 md:mt-4">
                  <span className="text-sm text-white">Backed by</span>
                  <Image src={yc} alt="backed by Y Combinator" className="w-32 sm:w-40 md:w-60" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center bg-primary w-full">
          <div className="flex flex-col w-full max-w-full xl:max-w-[1200px]">

            <div className="flex flex-col w-full relative md:pb-0 rounded">
              <div
                key={selectedSection.id}
                className="z-20 col-span-2 pt-8"
              >
                <div className="flex flex-wrap border-none gap-2 sm:gap-4 col-span-1 overflow-x-auto justify-center pb-8 text-lg font-semibold tracking-wide font-title">
                  {sections.map((section, i) => (
                    <button
                      key={i}
                      onClick={() => handleSectionSelect(section)}
                      className={`h-8 px-2 sm:px-3 rounded-md transition-colors duration-200 items-center flex whitespace-nowrap ${selectedSection.id === section.id
                        ? "bg-white/20 text-white"
                        : "text-white/80 hover:text-white"
                        }`}
                    >
                      {section.title}
                      {section.isNew && <span className="text-primary pl-1 sm:pl-2 mb-0.5 text-xs sm:text-sm">new</span>}
                    </button>
                  ))}
                </div>
                <Image
                  alt={selectedSection.title}
                  src={selectedSection.image}
                  priority
                  className="animate-in fade-in duration-500 rounded-lg w-full bg-background object-cover object-top h-[250px] md:h-[400px] lg:h-[700px]"
                />
              </div>
            </div>
            <div className="flex flex-col w-full max-w-full xl:max-w-[1200px]">
              <h1 className="text-4xl font-bold tracking-normal font-title text-white py-32 leading-wide">
                With Laminar dev teams monitor agents in production, <br />
                understand agent failure modes, and create evals to improve them.
              </h1>
              <span className="text-white/80 text-base font-semibold font-title">
                Why teams choose Laminar
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 my-8 mb-24">
                <FeatureCard
                  title="Fully open source"
                  subtitle="Self-host or use our cloud. Transparent, extensible, and community-driven."
                />
                <FeatureCard
                  title="Highly scalable"
                  subtitle="Optimized pipeline that scales with your traffic without breaking the bank."
                />
                <FeatureCard
                  title="SQL editor"
                  subtitle="Analyze traces and metrics with a built-in SQL workspace."
                />
                <FeatureCard
                  title="Affordable pricing"
                  subtitle="Simple, usage-based pricing designed for startups and scale-ups."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] py-4 sm:py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 px-4 sm:px-8 md:px-0">
            <TestimonialCard
              quote={`I can attest to it being the only reliable and performant LLM monitoring platform I${"'"}ve tried. Founding team is great to talk to and super responsive.`}
              author="Tommy He"
              role="CTO"
              company="Clarum"
              logo={clarum}
              className="border-b pb-6 sm:pb-8 md:border-r md:border-b-0"
            />
            <TestimonialCard
              quote={`Laminar's evals help us maintain high accuracy while moving fast, and their team is incredibly responsive. We now use them for every LLM based feature we build.`}
              author="Hashim Rehman"
              role="CTO"
              company="Remo"
              logo={remo}
              className="border-b pb-6 sm:pb-8 md:border-r md:border-b-0"
            />
            <TestimonialCard
              quote={`Laminar's tracing is genuinely great. So much better than the others I${"'"}ve tried.`}
              author="Michael Ettlinger"
              role="CTO"
              company="Saturn"
              logo={saturn}
              className="border-r-0"
            />
          </div>
        </div>
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] px-4 md:px-0">
          <h1 className="text-4xl font-bold tracking-normal font-title text-white pt-16 pb-8">
            Observe
          </h1>
          <div className="flex flex-col w-full border">
            <div className="flex flex-col">
              <div className="flex items-center border-b">
                <InfoCard
                  title="1 line of code to trace LLM frameworks and SDKs"
                  description="Simply initialize Laminar at the top of your project and popular LLM frameworks and SDKs will be automatically traced."
                  animationOrder={0}
                >
                  <div className="flex w-full">
                    <FrameworksGrid gridClassName="grid grid-cols-4 md:grid-cols-5 gap-4 items-center justify-center w-full" labelTextColor="text-white/70" />
                  </div>
                </InfoCard>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div>
                  <InfoCard
                    title="See traces of long-running agents in real time"
                    description="Don't wait until the end of your AI agent run to start debugging. Laminar shows spans as they happen in real time."
                    animationOrder={1}
                    className="md:border-l border-b"
                  >
                  </InfoCard>
                  <InfoCard
                    title="Automatic error capture"
                    description="Laminar automatically captures application level exceptions."
                    animationOrder={1}
                    className="md:border-l border-b"
                  >
                  </InfoCard>
                  <InfoCard
                    title="Tool calls and structured output tracing"
                    description="Understand when your agent fails to use tools and to produce structured output."
                    animationOrder={1}
                    className="md:border-l border-b"
                  >
                  </InfoCard>
                  <InfoCard
                    title="Track custom metrics with events"
                    description="You can emit events with custom metadata from your code to track custom metrics of your agent."
                    animationOrder={1}
                    className="md:border-l border-b"
                  >
                  </InfoCard>
                </div>
                <div className="flex w-full h-full">
                  <Image src={observe} alt="Observe" className="w-full object-cover object-top" quality={100} />
                </div>
              </div>
              <InfoCard
                title="Browser agent observability"
                description={`
Laminar automatically records high-quality browser sessions and syncs them with agent traces to help you see what the browser agent sees.`}
                linkUrl="https://docs.lmnr.ai/tracing/browser-agent-observability"
                actionText="Learn about browser agent observability"
                image={browserAgentObservability}
                animationOrder={2}
                className="border-b items-center"
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-10 h-10 bg-white/10 rounded-full">
                    <IconBrowserUse className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex items-center justify-center w-10 h-10 bg-white/10 rounded-full">🤘</div>
                  <div className="flex items-center justify-center w-10 h-10 bg-white/10 rounded-full">
                    <IconPlaywright className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div
                  style={{
                    transform: "translateY(0)",
                    transition: `transform 700ms ease`,
                  }}
                >
                  <div className="md:border-l md:border-t-0 border-t">
                    <Image src={browserAgentObservability} alt="Browser agent observability" className="w-full object-cover object-top" />
                  </div>
                </div>
              </InfoCard>
            </div>
          </div>
        </div>
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] px-4 md:px-0">
          <h1 className="text-4xl font-bold tracking-normal font-title text-white pt-16 pb-8">
            Query & Analyze
          </h1>
          <div className="flex flex-col w-full">
            <div className="flex flex-col">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-32">
                <div className="grid grid-cols-1">
                  <InfoCard
                    title="Query all data on the platform with SQL"
                    description="Access to traces, evals, datasets and events data on the platform with a built-in SQL editor."
                    animationOrder={0}
                  >
                  </InfoCard>
                  <InfoCard
                    title="Track what matters to you with custom dashboards"
                    description="Skip the dashboard builder. Just write SQL to create custom dashboards to track custom metrics of your agent."
                    animationOrder={0}
                  >
                  </InfoCard>
                  <InfoCard
                    title="From query to eval datasets in seconds"
                    description="Use SQL to query custom data filtered by your own criteria. Batch insert to labeling queues or directly to datasets in seconds."
                    animationOrder={2}
                    className="border-b md:border-b-0 bg-background"
                  >
                  </InfoCard>
                  <InfoCard
                    title="Access platform data via SQL API"
                    description="Use the Laminar SQL API to query traces, evals, datasets and events data from your own applications."
                    animationOrder={1}
                  >
                    {/* <DatasetsAnimation /> */}
                  </InfoCard>
                </div>
                <div className="py-8">
                  <Image src={query} alt="Query and analyze" className="w-full object-cover object-top" quality={100} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] px-4 md:px-0">
          <h1 className="text-4xl font-bold tracking-normal font-title text-white pt-16 pb-8">
            Evaluate & Iterate
          </h1>
          <div className="flex flex-col w-fullx">
            <div className="flex flex-col">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="grid grid-cols-1">
                  <InfoCard
                    title="Zero boilerplate evaluation SDK"
                    description="Skip the setup hell. Write your agent function and evaluator, pass in your data, and run. We automatically handle parallelism and retries."
                    animationOrder={0}
                  >
                  </InfoCard>
                  <InfoCard
                    title="Iterate on prompts without touching your codebase"
                    description="Open LLM calls in the Playground. Iterate fast - test new prompts, try different models, and validate improvements."
                    animationOrder={0}
                  >
                  </InfoCard>
                  <InfoCard
                    title="Catch regressions before your users do"
                    description="See the impact of every change before it goes live. Compare evaluation runs to catch regressions early and validate that your improvements actually work."
                    animationOrder={1}
                  >
                    {/* <DatasetsAnimation /> */}
                  </InfoCard>
                  <InfoCard
                    title="Build high-quality eval datasets efficiently"
                    description="No complex labeling tools or workflows. Just queue your data and start labeling. Perfect for teams getting started with systematic evaluation."
                    animationOrder={2}
                  >
                  </InfoCard>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}

function InfoCard({
  title,
  description,
  image,
  children,
  className = "",
  linkUrl = undefined,
  actionText = undefined,
  animationOrder = 0,
}: {
  title: string;
  description: string;
  linkUrl?: string;
  actionText?: string;
  image?: StaticImageData;
  children?: React.ReactNode;
  className?: string;
  animationOrder?: number;
}) {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const baseDelay = animationOrder * 150;

  return (
    <div
      ref={ref}
      className={`grid transition-all
        relative overflow-hidden ${className}
        ${image ? "grid-cols-2" : ""}
      `}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(30px)",
        transition: `opacity 600ms ease ${baseDelay}ms, transform 600ms ease ${baseDelay}ms`,
      }}
    >
      <div className="p-8 space-y-1 flex flex-col">
        <h3
          className="text-xl font-semibold transition-all tracking-normal font-title"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
            transition: `opacity 500ms ease ${baseDelay + 100}ms, transform 500ms ease ${baseDelay + 100}ms`,
          }}
        >
          {title}
        </h3>
        <p
          className="text-secondary-foreground/80 transition-all text-sm font-semibold tracking-normal font-title"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
          }}
        >
          {description}
        </p>
        {linkUrl && (
          <div
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : "translateY(10px)",
              transition: `opacity 500ms ease ${baseDelay + 400}ms, transform 500ms ease ${baseDelay + 400}ms`,
            }}
          >
            <Link href={linkUrl} target="_blank" className="flex flex-col items-start">
              <div className="flex items-center rounded p-1 px-2 text-sm border border-white/20">
                {actionText} <ArrowUpRight className="ml-2 h-4 w-4" />
              </div>
            </Link>
          </div>
        )}
        {children && inView && (
          <div
            style={{
              opacity: inView ? 1 : 0,
              transition: `opacity 500ms ease ${baseDelay + 300}ms`,
            }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}


function TestimonialCard({
  quote,
  author,
  role,
  company,
  logo,
  className = "",
}: {
  quote: string;
  author: string;
  role: string;
  company: string;
  logo: StaticImageData;
  className?: string;
}) {
  return (
    <div className={`p-6 flex flex-col h-full gap-8 ${className}`}>
      <div className="flex items-center gap-4 mt-6 text-sm md:text-base justify-between">
        <div>
          <p className="text-white font-medium">{author}</p>
          <p className="text-white/60 text-sm">
            {role}, {company}
          </p>
        </div>
        <Image src={logo} alt={company} className="h-10 w-20 object-contain" />
      </div>
      <p className="text-secondary-foreground text-sm font-light">{quote}</p>
    </div>
  );
}

function RealTimeTraces() {
  return (
    <div className="flex flex-col">
      <div className="mt-4 bg-black/40 overflow-hidden shadow-lg">
        <div className="text-xs text-secondary-foreground">
          <div className="flex w-full items-center space-x-2 h-9 cursor-pointer group relative trace-item-1">
            <SpanTypeIcon
              iconClassName="min-w-4 min-h-4"
              spanType={SpanType.DEFAULT}
              containerWidth={22}
              containerHeight={22}
              size={16}
            />
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">
              agent.run_stream
            </div>
            <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
              52.64s
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center text-xs font-mono text-muted-foreground px-2">0:00</div>
          </div>
          <div className="flex w-full items-center space-x-2 h-9 cursor-pointer group relative pl-5 trace-item-2">
            <div className="absolute left-3 border-l-2 border-b-2 rounded-bl-lg h-5 w-3 -top-0" />
            <div className="flex items-center justify-center min-w-[22px] w-[22px] h-[22px] bg-blue-950 rounded-full">
              <SpanTypeIcon
                iconClassName="min-w-4 min-h-4"
                spanType={SpanType.DEFAULT}
                containerWidth={22}
                containerHeight={22}
                size={16}
              />
            </div>
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">
              agent.step
            </div>
            <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
              52.32s
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center text-xs font-mono text-muted-foreground px-2">0:00</div>
          </div>

          <div className="flex w-full items-center space-x-2 h-9 cursor-pointer group relative pl-12 trace-item-3">
            <div className="absolute left-10 border-l-2 border-b-2 rounded-bl-lg h-5 w-3 -top-0" />
            <div className="flex items-center justify-center min-w-[22px] w-[22px] h-[22px] bg-blue-950 rounded-full">
              <SpanTypeIcon
                iconClassName="min-w-4 min-h-4"
                spanType={SpanType.DEFAULT}
                containerWidth={22}
                containerHeight={22}
                size={16}
              />
            </div>
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">
              browser.update_state
            </div>
            <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
              44.15s
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center text-xs font-mono text-muted-foreground px-2">0:00</div>
          </div>

          <div className="flex w-full items-center space-x-2 h-9 cursor-pointer group relative pl-12 trace-item-4">
            <div className="absolute left-10 border-l-2 border-b-2 rounded-bl-lg h-12 w-3 -top-7" />
            <div className="flex items-center justify-center min-w-[22px] w-[22px] h-[22px] bg-blue-950 rounded-full">
              <SpanTypeIcon
                iconClassName="min-w-4 min-h-4"
                spanType={SpanType.DEFAULT}
                containerWidth={22}
                containerHeight={22}
                size={16}
              />
            </div>
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">
              agent.generate_action
            </div>
            <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
              8.17s
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center text-xs font-mono text-muted-foreground px-2">0:44</div>
          </div>

          <div className="flex w-full items-center space-x-2 h-9 cursor-pointer group relative pl-[4.5rem] trace-item-5">
            <div className="absolute left-16 border-l-2 border-b-2 rounded-bl-lg h-5 w-3 top-0" />
            <SpanTypeIcon
              iconClassName="min-w-4 min-h-4"
              spanType={SpanType.LLM}
              containerWidth={22}
              containerHeight={22}
              size={16}
            />
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">
              anthropic.chat
            </div>
            <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
              8.17s
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center text-xs font-mono text-muted-foreground px-2">0:44</div>
          </div>

          <div className="flex w-full items-center space-x-2 h-9 cursor-pointer group relative pl-12 trace-item-6">
            <div className="absolute left-10 border-l-2 border-b-2 rounded-bl-lg h-32 w-3 top-[-108px]" />
            <SpanTypeIcon
              iconClassName="min-w-4 min-h-4"
              spanType={SpanType.TOOL}
              containerWidth={22}
              containerHeight={22}
              size={16}
            />
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">
              done
            </div>
            <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
              0.00s
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center text-xs font-mono text-muted-foreground px-2">0:52</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes traceAnimation {
          0%,
          5% {
            opacity: 0;
            transform: translateY(-5px);
          }
          10% {
            opacity: 1;
            transform: translateY(0);
          }
          70% {
            opacity: 1;
            transform: translateY(0);
          }
          80% {
            opacity: 0;
            transform: translateY(-5px);
          }
          100% {
            opacity: 0;
            transform: translateY(-5px);
          }
        }

        .trace-item-1 {
          opacity: 0;
          animation: traceAnimation 10s infinite;
          animation-delay: 0s;
        }

        .trace-item-2 {
          opacity: 0;
          animation: traceAnimation 10s infinite;
          animation-delay: 0.7s;
        }

        .trace-item-3 {
          opacity: 0;
          animation: traceAnimation 10s infinite;
          animation-delay: 1.4s;
        }

        .trace-item-4 {
          opacity: 0;
          animation: traceAnimation 10s infinite;
          animation-delay: 2.1s;
        }

        .trace-item-5 {
          opacity: 0;
          animation: traceAnimation 10s infinite;
          animation-delay: 2.8s;
        }

        .trace-item-6 {
          opacity: 0;
          animation: traceAnimation 10s infinite;
          animation-delay: 3.5s;
        }
      `}</style>
    </div>
  );
}
