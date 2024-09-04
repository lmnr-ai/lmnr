import Code from "../ui/code";


export default function EvalsPagePlaceholder() {
  const tsString = `
import { Evaluation } from '@lmnr-ai/lmnr';
import OpenAI from 'openai';
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const getCapital = async ({country} : {country: string}): Promise<string> => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            }, {
                role: 'user',
                content: \`What is the capital of \${country}? 
                Just name the city and nothing else\`
            }
        ],
    });
    return response.choices[0].message.content ?? ''
}
const e = new Evaluation( 'my-evaluation', {
    data: [
        { data: { country: 'Canada' }, target: { capital: 'Ottawa' } },
        { data: { country: 'Germany' }, target: { capital: 'Berlin' } },
        { data: { country: 'Tanzania' }, target: { capital: 'Dodoma' } },
    ],
    executor: async (data) => await getCapital(data),
    evaluators: [
        async (output, target) => (await output) === target.capital ? 1 : 0
    ],
    config: {
        projectApiKey: process.env.LMNR_PROJECT_API_KEY
    }
})
e.run();
`


  return (
    <div className="h-full w-full justify-center flex p-2">
      <div className="flex flex-col">
        <div className="flex-col p-4 space-y-4 w-[650px]">
          <h2 className="text-secondary-foreground">
            You don{"'"}t have any evaluations in this project yet.
            To run an evaluation follow the example below.
            <a href="https://docs.lmnr.ai/evaluations/introduction" className="text-primary"> Read the docs.</a>
          </h2>
          <Code className='text-xs bg-background' code={tsString} language='typescript' />
        </div>
      </div>
    </div>
  );
}
