import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, tool, stepCountIs } from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, traceId, spans }: { messages: UIMessage[], traceId: string, spans: any[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    system: `You are an expert trace analysis assistant. You are analyzing a trace with ID: ${traceId} that contains ${spans?.length || 0} spans.
    
You can help users understand:
- Performance bottlenecks and optimization opportunities
- Error analysis and debugging insights  
- Execution flow and span relationships
- Token usage and cost analysis
- LLM model performance and behavior

When analyzing traces, be specific and actionable in your recommendations. Reference specific span data when available.`,
    tools: {
      weather: tool({
        description: 'Get the weather in a location (fahrenheit)',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          const temperature = Math.round(Math.random() * (90 - 32) + 32);
          return {
            location,
            temperature,
          };
        },
      }),
      convertFahrenheitToCelsius: tool({
        description: 'Convert a temperature in fahrenheit to celsius',
        inputSchema: z.object({
          temperature: z
            .number()
            .describe('The temperature in fahrenheit to convert'),
        }),
        execute: async ({ temperature }) => {
          const celsius = Math.round((temperature - 32) * (5 / 9));
          return {
            celsius,
          };
        },
      }),
      analyzeTracePerformance: tool({
        description: 'Analyze the performance characteristics of the current trace',
        inputSchema: z.object({
          focus: z.string().optional().describe('Specific aspect to focus on (e.g., "latency", "costs", "errors")'),
        }),
        execute: async ({ focus }) => {
          // This would normally analyze the actual spans data
          // For now, return mock analysis based on the focus
          const analyses = {
            latency: {
              totalDuration: '2.3s',
              bottlenecks: ['LLM generation took 1.8s', 'Database query took 0.4s'],
              recommendations: ['Consider caching frequent queries', 'Use streaming for better UX']
            },
            costs: {
              totalTokens: 1250,
              inputTokens: 800,
              outputTokens: 450,
              estimatedCost: '$0.0045',
              recommendations: ['Optimize prompts to reduce input tokens', 'Consider using a smaller model for simple tasks']
            },
            errors: {
              errorCount: 0,
              warnings: ['High token usage detected'],
              recommendations: ['Monitor token usage patterns']
            }
          };

          const focusKey = focus?.toLowerCase() as keyof typeof analyses;
          return analyses[focusKey] || analyses.latency;
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

