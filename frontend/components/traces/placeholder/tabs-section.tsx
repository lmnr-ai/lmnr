"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from "@/lib/const";

import CodeHighlighter from "../../ui/code-highlighter";

export function InstallTabsSection() {
  const [tabValue, setTabValue] = useState("typescript");

  return (
    <Tabs defaultValue="typescript" value={tabValue} onValueChange={setTabValue}>
      <TabsList className="border-none flex">
        <TabsTrigger value="typescript">TypeScript</TabsTrigger>
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
  );
}
