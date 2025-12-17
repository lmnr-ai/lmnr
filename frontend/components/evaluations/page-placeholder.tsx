"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from "@/lib/const";

import ApiKeyGenerator from "../onboarding/api-key-generator.tsx";
import CodeHighlighter from "../ui/code-highlighter";
import Header from "../ui/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export default function EvalsPagePlaceholder() {
  const [tabValue, setTabValue] = useState("typescript");

  const pythonEval = `from lmnr import evaluate

evaluate(
    data=[
        {
            "data": {"country": "Canada", "capital": "Ottawa"},
            "target": {"capital": "Ottawa"}
        }
    ],
    executor=lambda data: data["capital"],
    evaluators={
        "is_correct": lambda output, target: int(output == target["capital"])
    },
    group_id="my_first_feature",
    project_api_key='<YOUR_PROJECT_API_KEY>'
)`;

  const tsEval = `import { evaluate } from '@lmnr-ai/lmnr';

evaluate({
  data: [
    { 
      data: { country: 'Canada', capital: 'Ottawa' }, 
      target: { capital: 'Ottawa' } 
    },
  ],
  executor: (data) => data.capital,
  evaluators: [
    (output, target) => output === target.capital
  ],
  groupId: 'my_first_feature',
  config: {
    projectApiKey: '<YOUR_PROJECT_API_KEY>'
  }
})`;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Header path="evaluations" />
      <ScrollArea>
        <div className="flex flex-col mx-auto p-6 max-w-3xl gap-8 pb-16">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">Get started with Evaluations</h1>
            <p className="text-muted-foreground">
              You don{"'"}t have any evaluations yet. Follow these steps to run your first evaluation.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Install Laminar SDK</h2>
            <Tabs value={tabValue} onValueChange={setTabValue} defaultValue="typescript">
              <TabsList className="border-none flex">
                <TabsTrigger value="typescript">Typescript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
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
            </Tabs>
          </div>

          <ApiKeyGenerator context="evaluations" />

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Run your first evaluation</h2>
            <Tabs value={tabValue} onValueChange={setTabValue} defaultValue="typescript">
              <TabsList className="border-none flex">
                <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="python">
                <CodeHighlighter
                  copyable
                  className="text-xs bg-background p-4 rounded-md border"
                  code={pythonEval}
                  language="python"
                />
              </TabsContent>
              <TabsContent value="typescript">
                <CodeHighlighter
                  copyable
                  className="text-xs bg-background p-4 rounded-md border"
                  code={tsEval}
                  language="typescript"
                />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <a
              href="https://docs.lmnr.ai/evaluations/introduction"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            >
              Documentation
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://discord.com/invite/nNFUUDAKub"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            >
              Need help? Join Discord
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
