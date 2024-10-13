import { useState } from 'react';
import { useProjectContext } from '@/contexts/project-context';
import Code from '../ui/code';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { PYTHON_INSTALL, TYPESCRIPT_INSTALL } from '@/lib/const';


export default function TracesPagePlaceholder() {
  const { projectId } = useProjectContext();
  const [tabValue, setTabValue] = useState('python');

  const pythonInitialization = `from lmnr import Laminar as L
L.initialize(project_api_key="<YOUR_PROJECT_API_KEY>")`;

  const typescriptInitialization = `import { Laminar as L } from '@lmnr-ai/lmnr';
L.initialize({projectApiKey: "<YOUR_PROJECT_API_KEY>"});
`;

  const pythonString = `from lmnr import observe, Laminar as L

L.initialize(project_api_key="<YOUR_PROJECT_API_KEY>")
# line above automatically instruments common 
# LLM provider libraries and frameworks
# such as OpenAI, Anthropic, Langchain, and more.

@observe()  # annotate all functions you want to trace
def function_to_trace(...):
    ...
`;

  const typescriptString = `import { Laminar as L, observe } from '@lmnr-ai/lmnr';

L.initialize({ projectApiKey: "<YOUR_PROJECT_API_KEY>" });
// line above automatically instruments common 
// LLM provider libraries and frameworks
// such as OpenAI, Anthropic, Langchain, and more.

// wrap functions you want to trace
const function_to_trace = 
  observe({name: 'spanName'},(...) => {
  ...
})`;

  return (
    <div className="h-full w-full justify-center flex p-2">
      <div className="flex flex-col">
        <div className="flex-col p-4 mb-32 space-y-4 w-[800px]">
          <h1 className="text-2xl font-semibold mb-4">Quickstart</h1>
          <h3 className="text-secondary-foreground/80 font-light">
          You don{'\''}t have any traces in this project yet.
          Let{'\''}s send first few traces.
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
          <h2 className="text-xl font-semibold mb-4">Kickstart with just 2 lines</h2>
          <h3 className="text-secondary-foreground/80 font-light">
            If you already have Python or Typescript code, which uses LLM provider libraries, add 2 lines to auto-instrument your app.
            This will automatically instrument all major LLM providers (e.g. OpenAI, Anthropic), LLM frameworks including LangChain and LlamaIndex, and even vector DB calls.
          </h3>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="typescript">Typescript</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="python">
                <Code className='text-xs bg-background p-4 rounded-md border' code={pythonInitialization} language='python' />
              </TabsContent>
              <TabsContent value="typescript">
                <Code className='text-xs bg-background p-4 rounded-md border' code={typescriptInitialization} language='typescript' />
              </TabsContent>
            </div>
          </Tabs>
          <h3 className="text-secondary-foreground/80 font-light">
            <a href="https://docs.lmnr.ai/tracing/introduction" className="text-primary-foreground font-medium" target="_blank">Read the docs </a>
            to learn more.
            Also you can see simple app examples in the docs.
          </h3>
          <h2 className="text-xl font-semibold mb-4">Adding manual instrumentation (Optional)</h2>
          <h3 className="text-secondary-foreground/80 font-light">
            If you want to trace your own functions to see their durations, inputs and outputs, or want to group LLM calls or other spans into one trace, you can use @observe decorator in Python or async observe function in JavaScript/TypeScript.
          </h3>
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList className="border-none flex">
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="typescript">Typescript</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="python">
                <Code className='text-xs bg-background p-4 rounded-md border' code={pythonString} language='python' />
              </TabsContent>
              <TabsContent value="typescript">
                <Code className='text-xs bg-background p-4 rounded-md border' code={typescriptString} language='typescript' />
              </TabsContent>
            </div>
          </Tabs>
          <h2 className="text-xl font-semibold mb-4">Run your app</h2>
          <h3 className="text-secondary-foreground/80 font-light">
            Run your Python or Typescript app. Refresh the page to see traces.
          </h3>
          <h2 className="text-xl font-semibold mb-4">Cannot send traces?</h2>
          <h3 className="text-secondary-foreground/80 font-light">
            <a href="https://docs.lmnr.ai/tracing/troubleshooting" className="text-primary-foreground font-medium" target="_blank">Check troubleshooting guide </a>
            to learn more or
            <a href="https://discord.com/invite/nNFUUDAKub" className="text-primary-foreground font-medium" target="_blank"> message us </a>
            and we{'\''}ll be happy to help.
          </h3>
        </div>
      </div>
    </div>
  );
}
