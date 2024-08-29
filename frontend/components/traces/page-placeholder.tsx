import { Card } from "../ui/card";
import Code from "../ui/code";


export default function TracesPagePlaceholder() {
  const pythonString = `import os
from openai import OpenAI

from lmnr import observe, wrap_llm_call

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

@observe()  # annotate all functions you want to trace
def poem_writer(topic="turbulence"):
    prompt = f"write a poem about {topic}"

    # wrap the actual final call to LLM with \`wrap_llm_call\`
    response = wrap_llm_call(client.chat.completions.create)(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
    )

    poem = response.choices[0].message.content

    return poem

if __name__ == "__main__":
    print(poem_writer(topic="laminar flow"))
`

  return (
    <div className="h-full w-full justify-center flex p-2">
      <div className="flex flex-col sm:w-1/2 md:w-1/3">
        <Card className="w-full flex-col p-4 space-y-4">
          <h2>No traces in this project yet.
            To get started, instrument your code like this or
            <a href="https://docs.lmnr.ai/documentation/tracing/getting-started" className="text-primary"> learn more</a>
          </h2>
          <Code className='text-xs' code={pythonString} language='python' />
        </Card>
      </div>
    </div>
  );
}