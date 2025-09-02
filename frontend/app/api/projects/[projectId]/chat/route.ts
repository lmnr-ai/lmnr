import { google } from '@ai-sdk/google';
import { convertToModelMessages, smoothStream,stepCountIs, streamText, tool, UIMessage } from 'ai';
import { z } from 'zod';

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google('gemini-2.5-flash'),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    system: `You are helpful assistant.`,
    tools: {
      weather: tool({
        description: 'Get the weather in a location (fahrenheit)',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          console.log('Getting weather for 123', location);
          const temperature = Math.round(Math.random() * (90 - 32) + 32);
          return "Wheather in " + location + " is " + temperature + " degrees Fahrenheit";
        },
      }),
    },
    experimental_transform: smoothStream({
      delayInMs: 20, // optional: defaults to 10ms
      chunking: 'line', // optional: defaults to 'word'
    }),
  });

  return result.toUIMessageStreamResponse();
}

