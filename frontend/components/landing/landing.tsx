"use client";

import { ArrowUpRight } from "lucide-react";
import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";

import browserAgentObservability from "@/assets/landing/browser-agent-observability.png";
import browserSession from "@/assets/landing/browser-session.png";
import clarum from "@/assets/landing/companies/clarum.png";
import remo from "@/assets/landing/companies/remo.avif";
import saturn from "@/assets/landing/companies/saturn.png";
import evals from "@/assets/landing/evals.png";
import index from "@/assets/landing/index.png";
import traces from "@/assets/landing/traces.png";
import yc from "@/assets/landing/yc.svg";
import logo from "@/assets/logo/icon.svg";
import { SpanType } from "@/lib/traces/types";

import SpanTypeIcon from "../traces/span-type-icon";
import { Button } from "../ui/button";
import CodeHighlighter from "../ui/code-highlighter";
import { IconAmazonBedrock, IconAnthropic, IconBrowserUse, IconCrewAI, IconGemini, IconLangchain, IconMistral, IconOpenAI, IconOpenTelemetry, IconPlaywright, IconVercel } from "../ui/icons";
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
    id: "browser-agent-api",
    title: "Browser Agent API",
    description: `Index - our SOTA open-source browser agent is available as an API on Laminar platform.
    With a single prompt, you can now interact with any website via API and automate any task on the web.`,
    image: browserSession,
    docsLink: "https://docs.lmnr.ai/laminar-index/introduction",
    callToAction: "Use Index via API",
    tsCodeExample: `import { LaminarClient } from '@lmnr-ai/lmnr';

const client = new LaminarClient({ projectApiKey: "..." });

// Execute a browser agent task
const response = await client.agent.run({
  prompt: "Go to ycombinator.com, search for Laminar and give a summary of the company.",
});`,
    pythonCodeExample: `from lmnr import LaminarClient

client = LaminarClient(project_api_key="...")

# Execute a browser agent task
response = client.agent.run(
    prompt="Go to ycombinator.com, search for Laminar and give a summary of the company."
)`,
    isNew: true,
  },
  {
    id: "index",
    title: "Browser Agent UI",
    description: `Index - our SOTA open-source browser agent is available as a chat interface on Laminar platform.
    Index can autonomously perform complex tasks on the web. In the chat interface, you can see the agent's steps, leave agent to work in the background and take control of the browser when you need to.`,
    image: index,
    docsLink: "/chat",
    callToAction: "Use Index via chat",
    isNew: true,
  },
];

export default function Landing() {
  const [selectedSection, setSelectedSection] = useState<Section>(sections[0]);
  const [autoRotate, setAutoRotate] = useState(true);

  const handleSectionSelect = (section: Section) => {
    setSelectedSection(section);
    setAutoRotate(false);
    setTimeout(() => setAutoRotate(true), 20000);
  };

  useEffect(() => {
    if (!autoRotate) return;

    const timer = setInterval(() => {
      setSelectedSection((current) => {
        const currentIndex = sections.findIndex((section) => section.id === current.id);
        const nextIndex = (currentIndex + 1) % sections.length;
        return sections[nextIndex];
      });
    }, 15000);

    return () => clearInterval(timer);
  }, [autoRotate]);

  return (
    <>
      <div className="flex flex-col z-30 items-center pt-28 space-y-8 px-0 md:px-6 lg:px-8">
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] space-y-8">
          <div className="flex flex-col">
            <div className="flex flex-col items-center py-6 md:py-8 text-center relative">
              <div className="z-20 flex flex-col items-center gap-4 md:gap-6">
                <p className="text-[2.4rem] leading-tight tracking-tight md:text-[3.5rem] md:leading-tight text-white font-semibold animate-in fade-in duration-500">
                  How developers <br className="md:hidden" />{" "}
                  <span className="text-primary">build reliable AI products.</span>
                </p>
                <p className="text-2xl text-white/80 font-medium">
                  The open-source platform for tracing and evaluating AI applications.
                </p>
                <div className="flex space-x-4 items-center">
                  <Link href="/sign-up">
                    <Button className="w-40 h-12 text-base font-semibold">Get started - free</Button>
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
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] border border-x-0 md:border-x">
          <div className="flex flex-col w-full relative md:pb-0">
            <div className="flex flex-wrap border-none gap-2 sm:gap-4 font-medium col-span-1 p-4 sm:p-8 pb-0 overflow-x-auto">
              {sections.map((section, i) => (
                <button
                  key={i}
                  onClick={() => handleSectionSelect(section)}
                  className={`border border-white/20 h-8 px-2 sm:px-3 rounded transition-colors duration-200 items-center flex text-sm sm:text-base whitespace-nowrap ${selectedSection.id === section.id
                    ? "bg-white/90 text-black border-b-2"
                    : "text-white/80 hover:bg-white/10 "
                    }`}
                >
                  {section.title}
                  {section.isNew && <span className="text-primary pl-1 sm:pl-2 mb-0.5 text-xs sm:text-sm">new</span>}
                </button>
              ))}
            </div>
            <div className="z-20 text-white gap-4 sm:gap-8 grid grid-cols-1 md:grid-cols-2 p-4 sm:p-8">
              <div key={selectedSection.id} className="grid grid-cols-1 gap-4 sm:gap-8 col-span-2 md:grid-cols-2">
                <div className="flex flex-col space-y-4 sm:space-y-6 animate-in fade-in fade-out duration-700">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white/90">
                    {selectedSection.title}
                  </h1>
                  <p className="text-sm sm:text-base tracking-normal text-white/70">{selectedSection.description}</p>
                  {selectedSection.docsLink && (
                    <div className="flex flex-col space-y-2 justify-start">
                      <Link href={selectedSection.docsLink} target="_blank">
                        <Button variant="light" className="h-8">
                          {selectedSection.callToAction}
                          <ArrowUpRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
                {(selectedSection.pythonCodeExample || selectedSection.tsCodeExample) && (
                  <div className="flex flex-col w-full h-full border">
                    <CodeTabs pythonCode={selectedSection.pythonCodeExample} tsCode={selectedSection.tsCodeExample} />
                  </div>
                )}
              </div>
            </div>
            <div
              key={selectedSection.id}
              className="z-20 animate-in fade-in fade-out duration-700 col-span-2 md:block border bg-primary px-4 pt-4 sm:px-8 sm:pt-8 md:pt-16"
            >
              <Image
                alt={selectedSection.title}
                src={selectedSection.image}
                priority
                className="rounded-t-lg w-full bg-background object-cover object-top h-[300px] md:h-[400px] lg:h-[550px]"
              />
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
Laminar automatically records high-quality browser sessions and syncs them with agent traces to help you see what the browser agent sees.
This drastically improves the debugging experience and allows you to fix issues 10x faster.`}
                linkUrl="https://docs.lmnr.ai/tracing/introduction"
                actionText="Learn more"
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
                  <div className="flex items-center justify-center w-10 h-10 bg-white/10 rounded-full">
                    <Image src={logo} alt="Index" className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </InfoCard>
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="grid grid-cols-1">
                  <InfoCard
                    title="LLM playground"
                    description="Open LLM spans in the playground to experiment with prompts and models."
                    animationOrder={0}
                    className="border-b"
                  />
                  <InfoCard
                    title="Datasets"
                    description="Build datasets from span data for evals, fine-tuning and prompt engineering."
                    animationOrder={2}
                    className="border-b md:border-b-0"
                  />
                </div>
                <div className="grid grid-cols-1">
                  <InfoCard
                    title="Labels"
                    description="Label your spans with custom tags to make them more informative."
                    animationOrder={1}
                    className="md:border-l border-b"
                  />
                  <InfoCard
                    title="Open-Source and easy to self-host"
                    description="Laminar is fully open-source and easy to self-host."
                    animationOrder={3}
                    className="md:border-l"
                  ></InfoCard>
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
        relative overflow-hidden group ${className}
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
          className="text-2xl font-medium group-hover:text-white transition-all"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
            transition: `opacity 500ms ease ${baseDelay + 100}ms, transform 500ms ease ${baseDelay + 100}ms`,
          }}
        >
          {title}
        </h3>
        <p
          className="text-secondary-foreground/80 group-hover:text-white/80 transition-all text-sm"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
          }}
        >
          {description}
        </p>
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
