"use client";

import { ArrowUpRight, X } from "lucide-react";
import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import GitHubButton from "react-github-btn";

import clarum from "@/assets/landing/companies/clarum.png";
import remo from "@/assets/landing/companies/remo.avif";
import saturn from "@/assets/landing/companies/saturn.png";
import dataset from "@/assets/landing/dataset.png";
import evals from "@/assets/landing/evals.png";
import labels from "@/assets/landing/labels.png";
import moa from "@/assets/landing/MoA.png";
import noise from "@/assets/landing/noise_resized.jpg";
import noise1 from "@/assets/landing/noise1_resized.jpg";
import onlineEvals from "@/assets/landing/online-evals.png";
import smallTrace from "@/assets/landing/small-trace.png";
import traces from "@/assets/landing/traces.png";
import yc from "@/assets/landing/yc.svg";

import { Button } from "../ui/button";
import CodeEditor from "../ui/code-editor";
import CodeHighlighter from "../ui/code-highlighter";
import Footer from "./footer";

interface Section {
  id: string;
  title: string;
  description: string;
  pythonCodeExample: string;
  tsCodeExample: string;
  docsLink: string;
  callToAction: string;
  image: StaticImageData;
}

const sections: Section[] = [
  {
    id: "traces",
    title: "Trace",
    description: `Tracing your LLM application provides visibility into every
    execution step while collecting valuable data for evaluations, few-shot examples, and fine-tuning.
    With Laminar, you can start tracing with just 2 lines of code.`,
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
    title: "Evaluate",
    description: `Evaluations are unit tests for your LLM application. 
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
    id: "labels",
    title: "Label",
    description: `With Laminar, you can label LLM outputs to identify successes and failures.
    Build datasets for evaluations, fine-tuning and few-shot examples. You can also use human labels as evaluation scores.`,
    image: labels,
    docsLink: "https://docs.lmnr.ai/labels/introduction",
    pythonCodeExample: `from lmnr import Laminar

my_labels = { "success": "yes", }
# labels will be recorded for the LLM span
with Laminar.with_labels(my_labels):
  openai_client.chat.completions.create(
      messages=[ ... ]
  )

`,
    tsCodeExample: `import { Laminar, withLabels} from '@lmnr-ai/lmnr';

// Simple wrapper to record labels for LLM calls
await withLabels({ label: 'value' }, (message: string) => {
  return openaiClient.chat.completions.create({
    messages: [{ role: 'user', content: message }],
      // ...
    });
}, "What is the capital of France?");`,
    callToAction: "Label data",
  },
];

export default function Landing() {
  const [selectedSection, setSelectedSection] = useState<Section>(sections[0]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  const handleSectionSelect = (section: Section) => {
    setSelectedSection(section);
    setAutoRotate(false);
    setTimeout(() => setAutoRotate(true), 20000);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("githubBannerClosed");
      setShowBanner(stored ? false : true);
    }
  }, []);

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

  const closeBanner = () => {
    setShowBanner(false);
    localStorage.setItem("githubBannerClosed", "true");
  };

  return (
    <>
      {showBanner && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 hidden md:block">
          <div className="flex items-center gap-4 bg-primary p-4 rounded-full shadow-lg border border-white/40">
            <span className="font-semibold text-white">Star us on GitHub</span>
            <GitHubButton
              href="https://github.com/lmnr-ai/lmnr"
              data-color-scheme="no-preference: light; light: light; dark: light;"
              data-size="large"
              data-show-count="true"
              aria-label="Star lmnr-ai/lmnr on GitHub"
            >
              Star
            </GitHubButton>

            <button onClick={closeBanner} className="hover:bg-secondary rounded-full p-1" aria-label="Close banner">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col z-30 items-center space-y-16 pt-28">
        <div className="flex flex-col md:w-[1200px] space-y-8">
          <div className="flex flex-col">
            <div className="flex flex-col items-center py-8 text-center relative">
              <div className="inset-0 absolute z-10 overflow-hidden md:rounded-lg">
                <Image src={noise} alt="" className="w-full h-full" priority quality={100} />
              </div>
              <div className="z-20 flex flex-col items-center gap-12 p-8">
                <p className="text-4xl md:px-0 md:text-8xl md:leading-tight text-white font-medium animate-in fade-in duration-500">
                  How teams ship <br />
                  <span className="italic">reliable</span> AI products
                </p>
                <p className="md:text-3xl font-medium md:w-[650px] text-white/90">
                  Laminar is a unified open-source platform for tracing, evaluating, and labeling LLM products.
                </p>
                <div className="flex space-x-4 items-center">
                  <Link href="/projects">
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
                <div className="flex justify-center items-center gap-4 flex-col">
                  <span className="text-sm text-white">Backed by</span>
                  <Image src={yc} alt="backed by Y Combinator" className="w-40 md:w-60" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:items-center md:w-[1200px] md:px-0">
          <div className="flex flex-col gap-4 px-8 md:px-0 md:py-8">
            <p className="text-white text-center text-sm md:text-base">
              Teams that ship better LLM products with Laminar
            </p>
            <div className="flex justify-center items-center gap-12 flex-col md:flex-row">
              <Link href="https://clarum.ai" target="_blank">
                <Image src={clarum} alt="Clarum" className="w-32 md:w-40" />
              </Link>
              <Link href="https://getremo.ai" target="_blank">
                <Image src={remo} alt="Remo" className="w-44 md:w-60" />
              </Link>
              <Link href="https://saturnos.com" target="_blank">
                <Image src={saturn} alt="Saturn" className="w-32 md:w-48" />
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:items-center md:w-[1200px] md:px-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-8 md:px-0">
            <TestimonialCard
              quote={`I can attest to it being the only reliable and performant LLM monitoring platform I${"'"}ve tried. Founding team is great to talk to and super responsive.`}
              author="Tommy He"
              role="CTO"
              company="Clarum"
              logo={clarum}
            />
            <TestimonialCard
              quote={`Laminar's evals help us maintain high accuracy while moving fast, and their team is incredibly responsive. We now use them for every LLM based feature we build.`}
              author="Hashim Rehman"
              role="CTO"
              company="Remo"
              logo={remo}
            />
            <TestimonialCard
              quote={`Laminar's tracing is genuinely great. So much better than the others I${"'"}ve tried.`}
              author="Michael Ettlinger"
              role="CTO"
              company="Saturn"
              logo={saturn}
            />
          </div>
        </div>

        <div className="flex flex-col md:items-center md:w-[1200px]">
          <div className="flex flex-col gap-16 w-full relative md:p-8 md:pb-0">
            <div className="absolute inset-0 z-0 md:rounded-lg overflow-hidden">
              <Image src={noise1} alt="" className="w-full h-full" priority quality={100} />
            </div>
            <div className="z-20 text-white gap-8 grid grid-cols-1 md:grid-cols-2 p-4 md:p-0">
              <div className="flex border-none gap-4 font-medium col-span-1">
                {sections.map((section, i) => (
                  <button
                    key={i}
                    onClick={() => handleSectionSelect(section)}
                    className={`border border-white/40 h-8 px-3 rounded transition-colors duration-200 ${
                      selectedSection.id === section.id
                        ? "bg-white text-black border-b-2"
                        : "text-white hover:bg-white/10 "
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
              <div key={selectedSection.id} className="grid grid-cols-1 gap-8 col-span-2 md:grid-cols-2">
                <div className="flex flex-col space-y-4 animate-in fade-in fade-out duration-700">
                  <h1 className="text-4xl md:text-5xl font-semibold">{selectedSection.title}</h1>
                  <p className="font-medium text-lg md:text-xl text-white/80">{selectedSection.description}</p>
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
                <div className="flex flex-col w-full h-full">
                  <CodeTabs pythonCode={selectedSection.pythonCodeExample} tsCode={selectedSection.tsCodeExample} />
                </div>
              </div>
            </div>
            <div
              key={selectedSection.id}
              className="z-20 animate-in fade-in fade-out duration-700 col-span-2 md:block hidden"
            >
              <Image
                alt={selectedSection.title}
                src={selectedSection.image}
                priority
                className="rounded-t-lg w-full object-cover object-top h-[500px]"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col md:items-center md:w-[1200px] px-4 md:px-0">
          <div className="flex flex-col w-full space-y-4">
            <div className="flex flex-col space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TracingCard />
                <EvaluationsCard />
              </div>
            </div>
            <div className="flex flex-col space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DatasetCard />
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
    <div className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group">
      <Link
        href="https://docs.lmnr.ai/tracing/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h1 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">
            Effortless Observability
          </h1>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Add 2 lines of code to trace all LLM calls and traces. Traces are sent in the background via gRPC with
            minimal performance and latency overhead.
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
      <Link
        href="https://docs.lmnr.ai/datasets/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">
            Dynamic few-shot examples to improve prompts
          </h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Build datasets from traces for evaluations, fine-tuning and prompt engineering. Enhance prompts by
            retrieving semantically similar examples from indexed datasets.
          </p>
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Create a dataset <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="mt-auto">
          <div className="flex overflow-hidden border-t">
            <Image src={dataset} alt="Dataset visualization" className="w-full object-cover object-top max-h-[250px]" />
          </div>
        </div>
      </Link>
    </div>
  );
}

function EvaluationsCard() {
  return (
    <div className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group">
      <Link
        href="https://docs.lmnr.ai/evaluations/online-evaluations"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">
            Online evaluations
          </h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Setup LLM or Python online evaluators to process each received span. Evaluators automatically label spans,
            which is more scalable than human labeling.
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
    <div
      className={`bg-secondary/30 text-white border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group ${className}`}
    >
      <Link
        href="https://docs.lmnr.ai/pipeline/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-2xl font-medium">Serverless LLM pipelines</h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Our pipeline builder is an incredible prototyping tool. It lets you quickly build and iterate on both simple
            prompts and complex LLM chains. After that
          </p>
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Deploy LLM pipeline <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="mt-auto px-6">
          <div className="flex rounded-t-lg overflow-hidden border-t border-r border-l">
            <Image src={moa} alt="Prompt Chains visualization" className="w-full h-auto object-cover" />
          </div>
        </div>
      </Link>
    </div>
  );
}

function SelfHostCard() {
  return (
    <div className="bg-secondary/30 border rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden group">
      <Link href="https://github.com/lmnr-ai/lmnr" target="_blank" className="flex flex-col h-full relative z-10">
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">
            Fully open-source
          </h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Laminar is fully open-source and easy to self-host. Get started with just a few commands.
          </p>
          <CodeEditor
            className="p-0 max-h-[70px] bg-transparent"
            value={`git clone https://github.com/lmnr-ai/lmnr
cd lmnr
docker compose up -d`}
            editable={false}
          />
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Self-host Laminar <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
      </Link>
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
          className={`border border-white/40 h-7 px-2 rounded ${
            selectedLang === "typescript" ? "bg-white text-black" : "text-white font-medium"
          }`}
        >
          TypeScript
        </button>
        <button
          onClick={() => setSelectedLang("python")}
          className={`border border-white/40 h-7 px-2 rounded ${
            selectedLang === "python" ? "bg-white text-black" : "text-white font-medium"
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
}: {
  quote: string;
  author: string;
  role: string;
  company: string;
  logo: StaticImageData;
}) {
  return (
    <div className="bg-secondary/30 border rounded-lg p-6 flex flex-col justify-between h-full">
      <p className="text-secondary-foreground text-sm md:text-base">{quote}</p>
      <div className="flex items-center gap-4 mt-6 text-sm md:text-base">
        <Image src={logo} alt={company} className="w-12 h-12 object-contain" />
        <div>
          <p className="text-white font-medium">{author}</p>
          <p className="text-white/60 text-sm">
            {role}, {company}
          </p>
        </div>
      </div>
    </div>
  );
}
