'use client';

import { useState } from 'react';

import { useProjectContext } from '@/contexts/project-context';
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from '@/lib/const';

import CodeHighlighter from '../ui/code-highlighter';
import Header from '../ui/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

export default function EvalsPagePlaceholder() {
  const { projectId } = useProjectContext();
  const [tabValue, setTabValue] = useState('typescript');

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
})
`;

  return (
    <div className="h-full w-full flex flex-col">
      <Header path="evaluations" />
      <div className="flex flex-col justify-center items-center p-2">
        <div className="flex-col p-4 mb-32 space-y-4 w-[800px]">
          <h1 className="text-2xl font-semibold">Evaluations</h1>
          <p className="text-muted-foreground">
            You don{"'"}t have any evaluations in this project yet. To run an
            evaluation you can start by following the example below.
          </p>
          <h2 className="text-xl font-semibold">Install Laminar</h2>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="typescript">Typescript</TabsTrigger>
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
            Go to
            <a
              href={`/project/${projectId}/settings`}
              className="text-primary-foreground font-medium"
              target="_blank"
            >
              {' '}
              settings page{' '}
            </a>
            to generate an API key and use it in your code.
          </p>
          <h2 className="text-xl font-semibold">
            Run your first evaluation
          </h2>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="typescript">Typescript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="python">
                <CodeHighlighter
                  className="text-xs bg-background p-4 rounded-md border"
                  code={pythonEval}
                  language="python"
                />
              </TabsContent>
              <TabsContent value="typescript">
                <CodeHighlighter
                  className="text-xs bg-background p-4 rounded-md border"
                  code={tsEval}
                  language="typescript"
                />
              </TabsContent>
            </div>
          </Tabs>
          <p className="text-muted-foreground">
            <a
              href="https://docs.lmnr.ai/evaluations/introduction"
              className="text-primary font-medium underline"
              target="_blank"
            >
              Read the docs
            </a>
            {' '}to learn more.
          </p>
          <h2 className="text-xl font-semibold">Run your app</h2>
          <p className="text-muted-foreground">
            Run your Python or Typescript app. Refresh the page to see
            evaluations.
          </p>
          <h2 className="text-xl font-semibold">
            Cannot run evaluations?
          </h2>
          <p className="text-muted-foreground">
            <a
              href="https://discord.com/invite/nNFUUDAKub"
              className="text-primary font-medium underline"
              target="_blank"
            >
              Message us
            </a>
            {' '}and we{"'"}ll be happy to help.
          </p>
        </div>
      </div>
    </div>
  );
}
