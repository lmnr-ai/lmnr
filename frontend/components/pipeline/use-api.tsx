import { Code2, Copy } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { getRequiredEnvVars } from '@/lib/env/utils';
import { InputNode, NodeType, RunnableGraph } from '@/lib/flow/types';
import { getDefaultGraphInputs } from '@/lib/flow/utils';

import { Button } from '../ui/button';
import CodeHighlighter from '../ui/code-highlighter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface UseApiProps {
  pipelineName: string;
  targetRunnableGraph: RunnableGraph;
}

export default function UseApi({
  pipelineName,
  targetRunnableGraph
}: UseApiProps) {
  const nodes = Object.values(targetRunnableGraph.nodes);

  const inputNodes: InputNode[] = nodes.filter(
    (node) => node.type == NodeType.INPUT
  ) as InputNode[];
  const defaultInputs = getDefaultGraphInputs(inputNodes);
  const [selectedTab, setSelectedTab] = useState('python');
  const [copied, setCopied] = useState(false);

  const envVars = getRequiredEnvVars(nodes);
  const env = Array.from(envVars).reduce(
    (acc, model) => ({
      ...acc,
      [model]: `$${model}`
    }),
    {}
  );

  const pythonEnv = Array.from(envVars).reduce(
    (acc, model) => ({
      ...acc,
      [model]: `os.environ[${model}]`
    }),
    {}
  );

  const tsEnv = Array.from(envVars).reduce(
    (acc, model) => ({
      ...acc,
      [model]: `process.env.${model}`
    }),
    {}
  );

  let body = {
    pipeline: pipelineName,
    inputs: defaultInputs,
    env,
    metadata: {},
    stream: false
  };
  const indentAll = (str: string, indentBy: number) =>
    str
      .split('\n')
      .map((line, index) => {
        if (index === 0) return line;
        return ' '.repeat(indentBy) + `${line}`;
      })
      .join('\n');

  const curlString = `curl 'https://api.lmnr.ai/v1/pipeline/run' \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer $LAMINAR_API_KEY" \\
-d '${JSON.stringify(body, null, 2)}'`;

  const pythonString = `from lmnr import Laminar as L

L.initialize(project_api_key='<YOUR_PROJECT_API_KEY>')
  
result = L.run(
    pipeline = '${pipelineName}',
    inputs = ${indentAll(JSON.stringify(defaultInputs, null, 4), 4)},
    env = ${indentAll(JSON.stringify(pythonEnv, null, 4), 4)},
    metadata={},
)
print(result)
`;

  const tsString = `import { Laminar as L } from '@lmnr-ai/lmnr';

L.initialize({ projectApiKey: '<YOUR_PROJECT_API_KEY>' });

const result = await L.run({
  pipeline: '${pipelineName}',
  inputs: ${indentAll(JSON.stringify(defaultInputs, null, 2), 2)},
  env: ${indentAll(JSON.stringify(tsEnv, null, 2), 2)},
  metadata: {},
});
console.log(result);
`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="ml-2">
          <Code2 size={16} className="text-gray-600 mr-2" />
          use API
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[600px]">
        <DialogHeader>
          <div className="flex flex-row">
            <DialogTitle className="flex-grow">
              Call pipeline from code
            </DialogTitle>
            <Button
              className="p-2"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(
                  selectedTab === 'python'
                    ? pythonString
                    : selectedTab === 'ts'
                      ? tsString
                      : curlString
                );
                setCopied(true);
              }}
            >
              <Copy size={20} />
            </Button>
          </div>
        </DialogHeader>
        <Tabs
          defaultValue="python"
          onValueChange={(value) => {
            setCopied(false);
            setSelectedTab(value);
          }}
        >
          <TabsList>
            <TabsTrigger value="python">Python</TabsTrigger>
            <TabsTrigger value="ts">TypeScript</TabsTrigger>
            <TabsTrigger value="curl">cURL</TabsTrigger>
          </TabsList>
          <TabsContent value="python" className="w-full">
            <CodeHighlighter
              className="text-xs"
              code={pythonString}
              language="python"
            />
          </TabsContent>
          <TabsContent value="ts">
            <CodeHighlighter
              className="text-xs"
              code={tsString}
              language="javascript"
            />
          </TabsContent>
          <TabsContent value="curl">
            <CodeHighlighter
              className="text-xs"
              code={curlString}
              language="shell"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
