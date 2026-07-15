"use client";

import { useState } from "react";

import ApiKeyGenerator from "@/components/onboarding/api-key-generator";
import { InstallTabsSection } from "@/components/traces/placeholder/tabs-section";
import CodeHighlighter from "@/components/ui/code-highlighter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PYTHON_EVAL = `from lmnr import evaluate

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
    group_name="my_first_eval",
)`;

const TS_EVAL = `import { evaluate } from '@lmnr-ai/lmnr';

evaluate({
  data: [
    {
      data: { country: 'Canada', capital: 'Ottawa' },
      target: { capital: 'Ottawa' },
    },
  ],
  executor: (data) => data.capital,
  evaluators: {
    is_correct: (output, target) => (output === target.capital ? 1 : 0),
  },
  groupName: 'my_first_eval',
});`;

export function ManualTab() {
  const [tabValue, setTabValue] = useState("typescript");

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-3 items-start">
        <h3 className="text-base font-medium">Install Laminar SDK</h3>
        <InstallTabsSection />
      </div>

      <ApiKeyGenerator context="evaluations" titleClassName="text-base" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Run your first evaluation</h3>
          <p className="text-sm text-muted-foreground">
            Save this to a file, then run{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx lmnr eval</code> (TypeScript) or{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">lmnr eval</code> (Python).
          </p>
        </div>
        <Tabs value={tabValue} onValueChange={setTabValue} defaultValue="typescript">
          <TabsList className="border-none flex">
            <TabsTrigger value="typescript">TypeScript</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
          </TabsList>
          <TabsContent value="python">
            <CodeHighlighter
              copyable
              className="text-xs bg-background p-4 rounded-md border"
              code={PYTHON_EVAL}
              language="python"
            />
          </TabsContent>
          <TabsContent value="typescript">
            <CodeHighlighter
              copyable
              className="text-xs bg-background p-4 rounded-md border"
              code={TS_EVAL}
              language="typescript"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
