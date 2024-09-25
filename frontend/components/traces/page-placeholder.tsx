import Code from "../ui/code";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";


export default function TracesPagePlaceholder() {
  const pythonString = `from lmnr import observe, Laminar as L

L.initialize(project_api_key="<YOUR_PROJECT_API_KEY>")
# line above automatically instruments common 
# LLM provider libraries and frameworks
# such as OpenAI, Anthropic, Langchain, and more.

@observe()  # annotate all functions you want to trace
def function_to_trace(...):
    ...
`

  const typescriptString = `import { Laminar as L } from '@lmnr-ai/lmnr';

L.initialize({ projectApiKey: "<YOUR_PROJECT_API_KEY>" });
// line above automatically instruments common 
// LLM provider libraries and frameworks
// such as OpenAI, Anthropic, Langchain, and more.

// wrap functions you want to trace
const function_to_trace = 
  observe({name: 'spanName'},(...) => {
  ...
})`

  return (
    <div className="h-full w-full justify-center flex p-2">
      <div className="flex flex-col">
        <div className="flex-col p-4 space-y-4 w-[600px]">
          <h2 className="text-secondary-foreground/80 font-light">
            You don{"'"}t have any traces in this project yet.
            To start sending traces, instrument your code like this.
            <a href="https://docs.lmnr.ai/tracing/introduction" className="text-primary font-medium"> Read the docs.</a>
          </h2>
          <Tabs defaultValue="python">
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
        </div>
      </div>
    </div>
  );
}
