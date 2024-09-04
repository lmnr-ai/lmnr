import Code from "../ui/code";

export default function TracesPagePlaceholder() {
const pythonString = `from lmnr import observe
@observe()  # annotate all functions you want to trace
def function_to_trace(...):
    ...
`

  return (
    <div className="h-full w-full justify-center flex p-2">
      <div className="flex flex-col">
        <div className="flex-col p-4 space-y-4 w-[500px]">
          <h2 className="text-secondary-foreground">
            You don{"'"}t have any traces in this project yet.
            To start sending traces, instrument your code like this.
            <a href="https://docs.lmnr.ai/tracing/introduction" className="text-primary"> Read the docs.</a>
          </h2>
          <Code className='text-xs bg-background' code={pythonString} language='python' />
        </div>
      </div>
    </div>
  );
}
