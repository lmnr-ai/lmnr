"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from "@/lib/const";

import CodeHighlighter from "../ui/code-highlighter";

export function InstallTabsSection() {
  const [tabValue, setTabValue] = useState("typescript");

  return (
    <Tabs defaultValue="typescript" value={tabValue} onValueChange={setTabValue}>
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
  );
}

export function InitializationTabsSection() {
  const [tabValue, setTabValue] = useState("typescript");

  const pythonInitialization = `from lmnr import Laminar
Laminar.initialize(project_api_key="<YOUR_PROJECT_API_KEY>")`;

  const typescriptInitialization = `import { Laminar } from '@lmnr-ai/lmnr';
Laminar.initialize({projectApiKey: "<YOUR_PROJECT_API_KEY>"});
`;

  return (
    <Tabs value={tabValue} onValueChange={setTabValue} defaultValue="typescript">
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
  );
}





