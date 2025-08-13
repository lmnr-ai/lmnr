"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from "@/lib/const";

import FrameworksGrid from "../integrations/frameworks-grid";
import CodeHighlighter from "../ui/code-highlighter";
import Header from "../ui/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export default function TracesPagePlaceholder() {
  const { projectId } = useParams();
  const [tabValue, setTabValue] = useState("typescript");

  const pythonInitialization = `from lmnr import Laminar
Laminar.initialize(project_api_key="<YOUR_PROJECT_API_KEY>")`;

  const typescriptInitialization = `import { Laminar } from '@lmnr-ai/lmnr';
Laminar.initialize({projectApiKey: "<YOUR_PROJECT_API_KEY>"});
`;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Header path={"traces"} />
      <ScrollArea>
        <div className="flex-1 flex-col mx-auto p-6 overflow-y-auto max-w-[800px] gap-8 pb-16 flex">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Tracing quickstart</h1>
            <p className="text-muted-foreground">
              You don{"'"}t have any traces in this project yet. Here is how to send your first traces.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Install Laminar SDK</h2>
            <Tabs value={tabValue} onValueChange={setTabValue}>
              <TabsList className="border-none flex">
                <TabsTrigger value="typescript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <div className="mt-4">
                <TabsContent value="python">
                  <CodeHighlighter
                    copyable
                    className="text-xs bg-background p-4 rounded-md border"
                    code={PYTHON_INSTALL}
                    language="bash"
                  />
                </TabsContent>
                <TabsContent value="typescript">
                  <CodeHighlighter
                    copyable
                    className="text-xs bg-background p-4 rounded-md border"
                    code={TYPESCRIPT_INSTALL}
                    language="bash"
                  />
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Generate project API key</h2>
            <p className="text-muted-foreground">
              Go to the{" "}
              <a
                href={`/project/${projectId}/settings`}
                className="text-primary font-medium hover:text-primary/80 transition-colors"
                target="_blank"
              >
                settings page
              </a>{" "}
              to generate a project API key.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">
                Learn how to integrate Laminar with your framework or SDK
              </h2>
            </div>
            <FrameworksGrid gridClassName="grid grid-cols-7 gap-4" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Or add 2 lines of code to auto-instrument your app</h2>
            <p className="text-muted-foreground">
              Initialize Laminar at the top of your project and popular LLM frameworks and SDKs will be traced
              automatically.
            </p>
            <Tabs value={tabValue} onValueChange={setTabValue}>
              <TabsList className="border-none flex">
                <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <div className="mt-4">
                <TabsContent value="python">
                  <CodeHighlighter
                    copyable
                    className="text-xs bg-background p-4 rounded-md border"
                    code={pythonInitialization}
                    language="python"
                  />
                </TabsContent>
                <TabsContent value="typescript">
                  <CodeHighlighter
                    copyable
                    className="text-xs bg-background p-4 rounded-md border"
                    code={typescriptInitialization}
                    language="typescript"
                  />
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Documentation</h2>
            <p className="text-muted-foreground">
              <a
                href="https://docs.lmnr.ai/tracing/introduction"
                className="text-primary font-medium hover:text-primary/80 transition-colors"
                target="_blank"
              >
                Read the docs
              </a>{" "}
              to learn more about adding structure to your traces.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div >
  );
}
