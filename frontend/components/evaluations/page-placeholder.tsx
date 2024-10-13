import { useState } from 'react';
import Code from '../ui/code';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from '@/lib/const';
import { useProjectContext } from '@/contexts/project-context';

export default function EvalsPagePlaceholder() {
  const { projectId } = useProjectContext();
  const [tabValue, setTabValue] = useState('python');

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
    <div className="h-full w-full justify-center flex p-2">
      <div className="flex flex-col">
        <div className="flex-col p-4 mb-32 space-y-4 w-[800px]">
          <h1 className="text-2xl font-semibold mb-4">Evaluations</h1>
          <h3 className="text-secondary-foreground/80 font-light">
            You don{'\''}t have any evaluations in this project yet.
            To run an evaluation you can start by following the example below.
          </h3>
          <h2 className="text-xl font-semibold mb-4">Install Laminar</h2>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="typescript">Typescript</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="python">
                <Code className='text-xs bg-background p-4 rounded-md border' code={PYTHON_INSTALL} language='bash' />
              </TabsContent>
              <TabsContent value="typescript">
                <Code className='text-xs bg-background p-4 rounded-md border' code={TYPESCRIPT_INSTALL} language='bash' />
              </TabsContent>
            </div>
          </Tabs>
          <h2 className="text-xl font-semibold mb-4">Generate API key</h2>
          <h3 className="text-secondary-foreground/80 font-light">
            Go to
            <a href={`/project/${projectId}/settings`} className="text-primary-foreground font-medium" target="_blank"> settings page </a>
            to generate an API key and use it in your code.
          </h3>
          <h2 className="text-xl font-semibold mb-4">Run your first evaluation</h2>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="typescript">Typescript</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="python">
                <Code className='text-xs bg-background p-4 rounded-md border' code={pythonEval} language='python' />
              </TabsContent>
              <TabsContent value="typescript">
                <Code className='text-xs bg-background p-4 rounded-md border' code={tsEval} language='typescript' />
              </TabsContent>
            </div>
          </Tabs>
          <h3 className="text-secondary-foreground/80 font-light">
            <a href="https://docs.lmnr.ai/evaluations/introduction" className="text-primary-foreground font-medium" target="_blank">Read the docs </a>
            to learn more.
          </h3>
          <h2 className="text-xl font-semibold mb-4">Run your app</h2>
          <h3 className="text-secondary-foreground/80 font-light">
            Run your Python or Typescript app. Refresh the page to see evaluations.
          </h3>
          <h2 className="text-xl font-semibold mb-4">Cannot run evaluations?</h2>
          <h3 className="text-secondary-foreground/80 font-light">
            <a href="https://discord.com/invite/nNFUUDAKub" className="text-primary-foreground font-medium" target="_blank">Message us </a>
            and we{'\''}ll be happy to help.
          </h3>
        </div>
      </div>
    </div>
  );
}
