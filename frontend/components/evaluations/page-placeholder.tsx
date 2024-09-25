import { Card } from "../ui/card";
import Code from "../ui/code";


export default function EvalsPagePlaceholder() {
  const tsString = `import { evaluate } from '@lmnr-ai/lmnr';

evaluate( 'my-evaluation', {
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
})
`


  return (
    <div className="h-full w-full justify-center flex p-2">
      <div className="flex flex-col">
        <div className="flex-col p-4 space-y-4 w-[600px]">
          <h2 className="text-secondary-foreground/80 font-light">
            You don{"'"}t have any evaluations in this project yet.
            To run an evaluation you can start by following the example below.
            <a href="https://docs.lmnr.ai/evaluations/introduction" className="text-primary font-medium"> Read the docs.</a>
          </h2>
          <div className="border rounded-md p-4">
            <Code className='text-xs bg-background' code={tsString} language='typescript' />
          </div>
        </div>
      </div>
    </div>
  );
}