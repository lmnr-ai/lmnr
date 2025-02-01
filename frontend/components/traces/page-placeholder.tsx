"use client";

import { useState } from "react";

import { useProjectContext } from "@/contexts/project-context";
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from "@/lib/const";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import CodeHighlighter from "../ui/code-highlighter";
import Header from "../ui/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export default function TracesPagePlaceholder() {
  const { projectId } = useProjectContext();
  const [tabValue, setTabValue] = useState("typescript");

  const pythonInitialization = `from lmnr import Laminar
Laminar.initialize(project_api_key="<YOUR_PROJECT_API_KEY>")`;

  const typescriptInitialization = `import { Laminar } from '@lmnr-ai/lmnr';
Laminar.initialize({projectApiKey: "<YOUR_PROJECT_API_KEY>"});
`;
  const typescriptInitializationWithOpenAI = `import { Laminar } from '@lmnr-ai/lmnr';
import { OpenAI } from 'openai';
Laminar.initialize({
  projectApiKey: "<YOUR_PROJECT_API_KEY>",
  instruments: {
    openAI: OpenAI,
  },
});
`;

  return (
    <div className="h-full w-full flex flex-col">
      <Header path={"traces"} />
      <div className="flex flex-col justify-center items-center p-2">
        <div className="flex-col p-4 mb-32 space-y-4 w-[800px]">
          <h1 className="text-2xl font-semibold">Quickstart</h1>
          <h3 className="text-muted-foreground">
            You don{"'"}t have any traces in this project yet. Here is how to send your first traces.
          </h3>
          <h2 className="text-xl font-semibold">Install Laminar SDK</h2>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="typescript">TypeScript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="python">
                <CodeHighlighter
                  className="text-xs bg-background p-4 rounded-md border"
                  code={PYTHON_INSTALL}
                  language="bash"
                />
              </TabsContent>
              <TabsContent value="typescript">
                <CodeHighlighter
                  className="text-xs bg-background p-4 rounded-md border"
                  code={TYPESCRIPT_INSTALL}
                  language="bash"
                />
              </TabsContent>
            </div>
          </Tabs>
          <h2 className="text-xl font-semibold">Generate API key</h2>
          <p className="text-muted-foreground">
            Go to the{" "}
            <a
              href={`/projects/${projectId}/settings`}
              className="text-primary-foreground font-medium underline"
              target="_blank"
            >
              settings page
            </a>{" "}
            to generate a project API key.
          </p>
          <h2 className="text-xl font-semibold">Add 2 lines of code to auto-instrument your app</h2>
          <p className="text-muted-foreground">
            Laminar will automatically instrument all major LLM providers (e.g. OpenAI, Anthropic), LLM frameworks
            including LangChain, and vector DB calls.
          </p>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="typescript">TypeScript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="python">
                <CodeHighlighter
                  className="text-xs bg-background p-4 rounded-md border"
                  code={pythonInitialization}
                  language="python"
                />
                <Accordion type="single" className="w-full" collapsible>
                  <AccordionItem value="python-additional">
                    <AccordionTrigger className="w-full px-2 my-2 bg-amber-500/10 border-amber-500/30 border rounded-md">
                      <div className="flex justify-between space-x-2 cursor-pointer w-full">
                        <div className="flex">If you are not seeing auto-instrumentations in Python</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col space-y-2">
                        <h3 className="text-muted-foreground">
                          Most likely reason is that you have installed `lmnr` package without specifying extras. Make
                          sure to use `lmnr[all]` in your requirements.txt of pyproject.toml file.
                        </h3>
                        <CodeHighlighter
                          className="text-xs bg-background p-4 rounded-md border"
                          code={PYTHON_INSTALL}
                          language="bash"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
              <TabsContent value="typescript">
                <CodeHighlighter
                  className="text-xs bg-background p-4 rounded-md border"
                  code={typescriptInitialization}
                  language="typescript"
                />
                <Accordion type="single" className="w-full" collapsible>
                  <AccordionItem value="js-additional">
                    <AccordionTrigger className="w-full px-2 my-2 bg-amber-500/10 border-amber-500/30 border rounded-md">
                      <div className="flex justify-between space-x-2 cursor-pointer w-full">
                        <div className="flex">If you are not seeing auto-instrumentations in JS</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col space-y-2">
                        <h3 className="text-muted-foreground">
                          In some JavaScript setups, it is required to specify the instruments when initializing
                          Laminar. For example
                        </h3>
                        <CodeHighlighter
                          className="text-xs bg-background p-4 rounded-md border"
                          code={typescriptInitializationWithOpenAI}
                          language="typescript"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
            </div>
          </Tabs>
          <h2 className="text-xl font-semibold">Documentation</h2>
          <p className="text-muted-foreground">
            <a
              href="https://docs.lmnr.ai/tracing/introduction"
              className="text-primary font-medium underline"
              target="_blank"
            >
              Read the docs
            </a>{" "}
            to learn more about adding structure to your traces.
          </p>
          <h2 className="text-xl font-semibold">Cannot send traces?</h2>
          <p className="text-muted-foreground">
            <a
              href="https://docs.lmnr.ai/tracing/troubleshooting"
              className="text-primary font-medium underline"
              target="_blank"
            >
              Check troubleshooting guide
            </a>{" "}
            to learn more or{" "}
            <a
              href="https://discord.com/invite/nNFUUDAKub"
              className="text-primary font-medium underline"
              target="_blank"
            >
              message us
            </a>{" "}
            and we{"'"}ll be happy to help.
          </p>
        </div>
      </div>
    </div>
  );
}
