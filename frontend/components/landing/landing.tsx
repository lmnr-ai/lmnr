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
import datasets from "@/assets/landing/datasets.png";
import evals from "@/assets/landing/evals.png";
import labeling from "@/assets/landing/labeling.png";
import llmPlayground from "@/assets/landing/llm-playground.png";
import playground from "@/assets/landing/playground.png";
import traces from "@/assets/landing/traces.png";
import yc from "@/assets/landing/yc.svg";
import { SpanType } from "@/lib/traces/types";

import SpanTypeIcon from "../traces/span-type-icon";
import { Button } from "../ui/button";
import CodeHighlighter from "../ui/code-highlighter";
import { IconAmazonBedrock, IconAnthropic, IconBrowserUse, IconCrewAI, IconGemini, IconLangchain, IconMistral, IconOpenAI, IconOpenTelemetry, IconPlaywright, IconVercel } from "../ui/icons";
import DatasetsAnimation from "./datasets-animation";
import Footer from "./footer";

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
      <div className="flex flex-col z-30 items-center pt-28 space-y-8 px-0 md:px-6 lg:px-8">
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] space-y-8">
          <div className="flex flex-col">
            <div className="flex flex-col items-center py-6 md:py-16 text-center relative">
              <div className="z-20 flex flex-col items-center gap-4 md:gap-6">
                <p className="text-[2.4rem] leading-tight tracking-[-0.027em] md:text-[3.5rem] md:leading-tight text-white font-semibold animate-in fade-in duration-500 font-manrope">
                  How developers <br className="md:hidden" />{" "}
                  <span className="text-primary">build reliable AI agents.</span>
                </p>
                <p className="text-2xl text-white/70 font-medium px-2 md:px-0">
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
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px]">

          <div className="flex flex-col w-full relative md:pb-0 rounded">
            <div
              key={selectedSection.id}
              className="z-20 col-span-2 md:block border bg-primary px-4 sm:px-8 pt-8 rounded-none md:rounded-lg"
            >
              <div className="flex flex-wrap border-none gap-2 sm:gap-4 font-medium col-span-1 overflow-x-auto justify-center pb-8">
                {sections.map((section, i) => (
                  <button
                    key={i}
                    onClick={() => handleSectionSelect(section)}
                    className={`border-[1.5px] border-white/80 h-8 px-2 sm:px-3 rounded-md transition-colors duration-200 items-center flex text-sm sm:text-base whitespace-nowrap ${selectedSection.id === section.id
                      ? "bg-white/90 text-black/90 border-b-2"
                      : "text-white hover:bg-white/20 "
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
                className="animate-in fade-in duration-500 rounded-t-lg w-full bg-background object-cover object-top h-[250px] md:h-[400px] lg:h-[600px]"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] text-center py-8">
          <h1 className="text-5xl font-semibold tracking-normal font-manrope">
            With Laminar you understand how your agent fails
          </h1>
          <div className="flex flex-col">
            <div className="flex flex-col">

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
          <div className="flex flex-col w-full border">
            <div className="flex flex-col">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <InfoCard
                  title="Automatic tracing of LLM frameworks and SDKs with 1 line of code"
                  description="Simply initialize Laminar at the top of your project and popular LLM frameworks and SDKs will be traced automatically."
                  animationOrder={0}
                  className="border-b"
                >
                  <div className="flex flex-col">
                    <div className="flex mt-4 flex-col">
                      <div className="grid grid-cols-4 md:grid-cols-5 gap-4 mt-2">
                        {[
                          {
                            name: "OpenTelemetry",
                            icon: <IconOpenTelemetry className="h-6 w-6" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/opentelemetry"
                          },
                          {
                            name: "Langchain",
                            icon: <IconLangchain className="h-8 w-8" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/langchain"
                          },
                          {
                            name: "CrewAI",
                            icon: <IconCrewAI className="w-6 h-6 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/crewai"
                          },
                          {
                            name: "AI SDK",
                            icon: <IconVercel className="w-4 h-4 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/vercel-ai-sdk"
                          },
                          {
                            name: "LiteLLM",
                            emoji: "🚅",
                            link: "https://docs.lmnr.ai/tracing/integrations/litellm"
                          },
                          {
                            name: "Browser Use",
                            icon: <IconBrowserUse className="w-5 h-5 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/browser-use"
                          },
                          {
                            name: "StageHand",
                            emoji: "🤘",
                            link: "https://docs.lmnr.ai/tracing/integrations/stagehand"
                          },
                          {
                            name: "Playwright",
                            icon: <IconPlaywright className="w-6 h-6 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/playwright"
                          },
                          {
                            name: "OpenAI",
                            icon: <IconOpenAI className="w-6 h-6 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/openai"
                          },
                          {
                            name: "Anthropic",
                            icon: <IconAnthropic className="w-6 h-6 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/anthropic"
                          },
                          {
                            name: "Gemini",
                            icon: <IconGemini className="w-6 h-6 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/gemini"
                          },
                          {
                            name: "Mistral",
                            icon: <IconMistral className="w-6 h-6 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/mistral"
                          },
                          {
                            name: "Bedrock",
                            icon: <IconAmazonBedrock className="w-6 h-6 text-white" />,
                            link: "https://docs.lmnr.ai/tracing/integrations/bedrock"
                          }
                        ].map((integration, index) => (
                          <Link
                            key={index}
                            target="_blank"
                            href={integration.link}
                            className="flex flex-col items-center group"
                          >
                            <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
                              {integration.icon || (
                                <span className="text-2xl">{integration.emoji}</span>
                              )}
                            </div>
                            <span className="text-xs text-white/70 mt-2">{integration.name}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </InfoCard>
                <InfoCard
                  title="Real-time traces"
                  description="Don't wait for your AI workflows and agents to finish to debug them. Laminar's tracing engine provides real-time traces."
                  animationOrder={1}
                  className="md:border-l border-b"
                >
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
                          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">agent.run_stream</div>
                          <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">52.64s</div>
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
                          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">agent.step</div>
                          <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">52.32s</div>
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
                          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">browser.update_state</div>
                          <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">44.15s</div>
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
                          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">agent.generate_action</div>
                          <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">8.17s</div>
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
                          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">anthropic.chat</div>
                          <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">8.17s</div>
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
                          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate text-white/80">done</div>
                          <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">0.00s</div>
                          <div className="flex-grow"></div>
                          <div className="flex items-center text-xs font-mono text-muted-foreground px-2">0:52</div>
                        </div>
                      </div>
                    </div>

                    <style jsx>{`
                      @keyframes traceAnimation {
                        0%, 5% { opacity: 0; transform: translateY(-5px); }
                        10% { opacity: 1; transform: translateY(0); }
                        70% { opacity: 1; transform: translateY(0); }
                        80% { opacity: 0; transform: translateY(-5px); }
                        100% { opacity: 0; transform: translateY(-5px); }
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
                </InfoCard>
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
                  <div className="flex items-center justify-center w-10 h-10 bg-white/10 rounded-full">
                    🤘
                  </div>
                  <div className="flex items-center justify-center w-10 h-10 bg-white/10 rounded-full">
                    <IconPlaywright className="w-5 h-5 text-white" />
                  </div>
                </div>
              </InfoCard>
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="grid grid-cols-1">
                  <InfoCard
                    title="Experiment with LLM spans in the Playground"
                    description="Open LLM spans in the Playground to experiment with prompts and models."
                    animationOrder={0}
                    className="border-b"
                    actionText="Learn about playgrounds"
                    linkUrl="https://docs.lmnr.ai/playground/quickstart"
                  >
                    <div className="h-[141px] relative">
                      <Image src={llmPlayground} alt="LLM playground" quality={100} />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 to-background pointer-events-none" />
                    </div>
                  </InfoCard>
                  <InfoCard
                    title="Manage eval datasets in a single place"
                    description="Build datasets from span data and use them for evals and prompt engineering."
                    animationOrder={2}
                    className="border-b md:border-b-0 bg-background"
                    actionText="Learn about datasets"
                    linkUrl="https://docs.lmnr.ai/datasets/quickstart"
                  >
                    <div className="relative">
                      <Image src={datasets} alt="Datasets" quality={100} />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background pointer-events-none" />
                    </div>
                  </InfoCard>
                </div>
                <div className="grid grid-cols-1">
                  <InfoCard
                    title="Create eval datasets from labeled data"
                    description="Use labeling queues to quickly label data and create eval datasets."
                    animationOrder={1}
                    className="md:border-l border-b"
                    actionText="Learn about labeling queues"
                    linkUrl="https://docs.lmnr.ai/queues/quickstart"
                  >
                    <DatasetsAnimation />
                  </InfoCard>
                  <InfoCard
                    title="Fully Open Source"
                    description="Laminar is fully open source and easy to self-host. Easy to deploy locally or on your own infrastructure with docker compose or helm charts."
                    animationOrder={3}
                    className="md:border-l"
                  >
                    <div className="flex flex-col space-y-4">
                      <Link href="https://github.com/lmnr-ai/lmnr" target="_blank">
                        <div className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer group">
                          <div className="flex items-center justify-center w-10 h-10 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
                            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white group-hover:text-gray-200 transition-colors" fill="currentColor">
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white group-hover:text-gray-200 transition-colors">Open Source</div>
                            <div className="text-xs text-white/60 group-hover:text-white/80 transition-colors">Apache 2.0 License</div>
                          </div>
                          <div className="text-xs text-white/80 hover:text-white transition-colors flex items-center">
                            View on GitHub
                            <ArrowUpRight className="ml-1 h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </div>
                        </div>
                      </Link>
                    </div>
                  </InfoCard>
                </div>
              </div>
            </div>
          </div>
        </div >

        <Footer />
      </div >
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
      <div className="p-10 space-y-2 flex flex-col">
        <h3
          className="text-2xl font-semibold transition-all tracking-normal font-manrope"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
            transition: `opacity 500ms ease ${baseDelay + 100}ms, transform 500ms ease ${baseDelay + 100}ms`,
          }}
        >
          {title}
        </h3>
        <p
          className="text-secondary-foreground/80 transition-all text-lg"
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
      {image && (
        <div
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateY(0)" : "translateY(20px)",
            transition: `opacity 700ms ease ${baseDelay + 500}ms, transform 700ms ease ${baseDelay + 500}ms`,
          }}
        >
          <div className="md:border-l md:border-t-0 border-t">
            <Image src={image} alt={title} className="w-full object-cover object-top" />
          </div>
        </div>
      )}
    </div>
  );
}

function CodeTabs({ pythonCode, tsCode }: { pythonCode?: string; tsCode?: string }) {
  const [selectedLang, setSelectedLang] = useState("typescript");

  return (
    <div className="w-full bg-black rounded-lg h-full flex flex-col">
      <div className="p-4 flex space-x-2 text-sm font-medium">
        <button
          onClick={() => setSelectedLang("typescript")}
          className={`border border-white/40 h-7 px-2 rounded ${selectedLang === "typescript" ? "bg-white text-black" : "text-white/90 font-medium"
            }`}
        >
          TypeScript
        </button>
        <button
          onClick={() => setSelectedLang("python")}
          className={`border border-white/40 h-7 px-2 rounded ${selectedLang === "python" ? "bg-white text-black" : "text-white/90 font-medium"
            }`}
        >
          Python
        </button>
      </div>

      <div className="p-4">
        {selectedLang === "python" && (
          <CodeHighlighter
            className="bg-black border-white"
            code={pythonCode || ""}
            language="python"
            copyable={false}
          />
        )}
        {selectedLang === "typescript" && (
          <CodeHighlighter
            className="bg-black border-white"
            code={tsCode || ""}
            language="javascript"
            copyable={false}
          />
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
