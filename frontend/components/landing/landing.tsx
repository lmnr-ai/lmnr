'use client';

import { ArrowUpRight, X } from 'lucide-react';
import Image, { StaticImageData } from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import amazon from '@/assets/landing/amazon.svg';
import dataset from '@/assets/landing/dataset.png';
import evals from '@/assets/landing/evals.png';
import github from '@/assets/landing/github-mark-white.svg';
import labels from '@/assets/landing/labels.png';
import moa from '@/assets/landing/MoA.png';
import noise from '@/assets/landing/noise.jpeg';
import noise1 from '@/assets/landing/noise1.jpeg';
import onlineEvals from '@/assets/landing/online-evals.png';
import palantir from '@/assets/landing/palantir.svg';
import smallTrace from '@/assets/landing/small-trace.png';
import traces from '@/assets/landing/traces.png';
import yc from '@/assets/landing/yc.svg';

import { Button } from '../ui/button';
import CodeEditor from '../ui/code-editor';
import CodeHighlighter from "../ui/code-highlighter";
import Footer from './footer';

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
    id: 'traces',
    title: 'Trace',
    description: 'Tracing your LLM application provides visibility into execution steps while collecting valuable data for evaluations, few-shot examples, and fine-tuning.',
    pythonCodeExample: `from lmnr import Laminar, observe

# automatically traces common LLM frameworks and SDKs
Laminar.initialize(project_api_key="...")

@observe() # you can also manually trace any function
def my_function(...):
...`,
    tsCodeExample: `import { Laminar, observe } from '@lmnr-ai/lmnr';

// automatically traces common LLM frameworks and SDKs
Laminar.initialize({ projectApiKey: "..." });

// you can also manually trace any function
const myFunction = observe({name: 'myFunc'}, async () => {
...
})`,
    image: traces,
    docsLink: 'https://docs.lmnr.ai/tracing/introduction',
    callToAction: 'Start tracing your LLM app'
  },
  {
    id: 'evals',
    title: 'Evaluate',
    description: 'Evaluations are unit tests for your LLM application. They help you answer questions like "Did my last change improve the performance?". Run custom evals via code, CLI, or CI/CD pipeline.',
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
    docsLink: 'https://docs.lmnr.ai/evaluations/introduction',
    callToAction: 'Bring rigor to your LLM app'
  },
  {
    id: 'labels',
    title: 'Label',
    description: 'Label LLM outputs to identify successes and failures. Build datasets for fine-tuning, prompt examples, and targeted improvements. Use human labels for evaluations.',
    image: labels,
    docsLink: 'https://docs.lmnr.ai/labels/introduction',
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
    callToAction: 'Label data'
  }
];

export default function Landing() {
  const [stars, setStars] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<Section>(sections[0]);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    fetch('/api/stars', { cache: 'no-cache' })
      .then(res => res.json())
      .then(data => setStars(data.stars))
      .catch(err => console.error('Failed to fetch GitHub stars:', err));
  }, []);

  // Reset timer when user manually selects section
  const handleSectionSelect = (section: Section) => {
    setSelectedSection(section);
    setAutoRotate(false);
    // Reset auto-rotate after 20 seconds
    setTimeout(() => setAutoRotate(true), 20000);
  };

  // Auto-rotate timer
  useEffect(() => {
    if (!autoRotate) return;

    const timer = setInterval(() => {
      setSelectedSection(current => {
        const currentIndex = sections.findIndex(section => section.id === current.id);
        const nextIndex = (currentIndex + 1) % sections.length;
        return sections[nextIndex];
      });
    }, 15000);

    return () => clearInterval(timer);
  }, [autoRotate]);

  return (
    <>
      <div className="flex flex-col z-30 items-center space-y-16 pt-28">
        <div className="flex flex-col md:w-[1200px] space-y-8">
          <div className="flex flex-col">
            <div className="flex flex-col items-center pt-4 text-center relative">
              <div className="inset-0 absolute z-10 md:rounded-lg overflow-hidden">
                <Image src={noise} alt="" className="w-full h-full" priority />
              </div>
              <div className="z-20 flex flex-col items-center space-y-10 p-8">
                <p className="text-6xl md:px-0 md:text-8xl md:leading-tight text-white font-medium animate-in fade-in duration-500">
                  The AI engineering <br /> platform
                </p>
                <p className="text-[1.2rem] md:text-2xl md:w-[750px] font-medium text-white">
                  Laminar is an open-source platform
                  for engineering LLM products. Trace, evaluate, label, and analyze LLM apps.
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
        <div className="flex flex-col md:items-center md:w-[1200px] md:px-0 py-16">
          <div className="flex flex-col gap-4">
            <span
              className="text-4xl md:text-6xl text-white font-medium"
            >
              Building with LLMs? <br />
            </span>
            <span className="text-3xl md:text-2xl md:leading-relaxed font-medium">
              Then, you might be <br />
            </span>
            <div className="text-xl font-medium text-secondary-foreground flex flex-col gap-4">
              <span className="flex items-center"><X className="w-6 h-6 mr-2" /> Struggling to monitor LLM calls in production.</span>
              <span className="flex items-center"><X className="w-6 h-6 mr-2" /> Don&apos;t know how last prompt change affected performance.</span>
              <span className="flex items-center"><X className="w-6 h-6 mr-2" /> Lacking data for fine-tuning and prompt engineering.</span>
            </div>
          </div>
          <p className="text-xl md:text-6xl text-white/90 font-medium md:leading-tight pt-24 pb-4">
            Laminar is a single solution for <br />
            <span className="font-medium text-primary">tracing</span>, <span className="font-medium text-primary">evaluating</span>, and <span className="font-medium text-primary">labeling</span> <br />
            LLM products.
          </p>
        </div>

        <div className="flex flex-col md:items-center md:w-[1200px]">
          <div className="flex flex-col gap-16 w-full relative md:p-8 md:pb-0">
            <div className="absolute inset-0 z-0 md:rounded-lg overflow-hidden">
              <Image
                src={noise1}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="z-20 text-white gap-4 grid grid-cols-1 md:grid-cols-2 h-80">
              <div key={selectedSection.id} className="flex flex-col gap-8">
                <div className="flex border-none gap-4 font-medium">
                  {sections.map((section, i) => (
                    <button
                      key={i}
                      onClick={() => handleSectionSelect(section)}
                      className={`border border-white/40 h-8 px-3 rounded transition-colors duration-200 ${selectedSection.id === section.id
                        ? 'bg-white text-black border-b-2'
                        : 'text-white hover:bg-white/10 '}`}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col space-y-4 animate-in fade-in fade-out duration-700">
                  <h1 className="text-5xl font-semibold">{selectedSection.title}</h1>
                  <p className="font-medium text-xl md:text-xl text-white/90">
                    {selectedSection.description}
                  </p>
                  {selectedSection.docsLink && (
                    <div className="flex flex-col space-y-2 justify-start">
                      <Link
                        href={selectedSection.docsLink}
                        target="_blank"
                      >
                        <Button variant="light" className="h-8">
                          {selectedSection.callToAction}
                          <ArrowUpRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col w-full h-full">
                <CodeTabs
                  pythonCode={selectedSection.pythonCodeExample}
                  tsCode={selectedSection.tsCodeExample}
                />
              </div>
            </div>
            <div key={selectedSection.id} className="z-20 animate-in fade-in fade-out duration-700">
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
      <Link
        href="https://docs.lmnr.ai/tracing/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h1 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">LLM observability that just works</h1>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Add 2 lines of code to trace all LLM calls and traces.
            Traces are sent in the background via gRPC with minimal performance and latency overhead.
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
          <h3 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">Datasets</h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
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
              className="w-full object-cover object-top max-h-[250px]"
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
      <Link
        href="https://docs.lmnr.ai/evaluations/online-evaluations"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">Online evaluations</h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Setup LLM or Python online evaluators to process each received span.
            Evaluators automatically label spans, which is more scalable than human labeling.
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
      <Link
        href="https://docs.lmnr.ai/pipeline/introduction"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-2xl font-medium">Serverless LLM pipelines</h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
            Our pipeline builder is an incredible prototyping tool. It lets you quickly build and iterate on both simple prompts and complex LLM chains. After that
          </p>
          <div className="flex">
            <div className="flex items-center rounded-lg p-1 px-2 text-sm border border-white/20">
              Deploy LLM pipeline <ArrowUpRight className="ml-2 h-4 w-4" />
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
      <Link
        href="https://github.com/lmnr-ai/lmnr"
        target="_blank"
        className="flex flex-col h-full relative z-10"
      >
        <div className="p-6 flex-grow space-y-2">
          <h3 className="text-2xl font-medium group-hover:text-white transition-colors duration-200">Fully open-source</h3>
          <p className="text-secondary-foreground/80 group-hover:text-white transition-colors duration-200">
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
              Self-host Laminar <ArrowUpRight className="ml-2 h-4 w-4" />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function CodeTabs({ pythonCode, tsCode }: { pythonCode?: string; tsCode?: string }) {
  const [selectedLang, setSelectedLang] = useState('typescript');

  return (
    <div className="w-full bg-black rounded-lg h-full flex flex-col">
      <div className="p-4 flex space-x-2 text-sm font-medium">
        <button
          onClick={() => setSelectedLang('typescript')}
          className={`border border-white/40 h-7 px-2 rounded ${selectedLang === 'typescript'
            ? 'bg-white text-black'
            : 'text-white font-medium'
          }`}
        >
          TypeScript
        </button>
        <button
          onClick={() => setSelectedLang('python')}
          className={`border border-white/40 h-7 px-2 rounded ${selectedLang === 'python'
            ? 'bg-white text-black'
            : 'text-white font-medium'
          }`}
        >
          Python
        </button>
      </div>

      <div className="p-4">
        {selectedLang === 'python' && (
          <CodeHighlighter
            className="bg-black border-white"
            code={pythonCode || ''}
            language="python"
          />
        )}
        {selectedLang === 'typescript' && (
          <CodeHighlighter
            className="bg-black border-white"
            code={tsCode || ''}
            language="javascript"
          />
        )}
      </div>
    </div>
  );
}
