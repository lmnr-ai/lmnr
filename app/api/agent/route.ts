import { StreamingTextResponse } from 'ai';
import { experimental_StreamData } from 'ai/stream';
import { NextRequest } from 'next/server';
import { RunAgentResponseStreamChunk } from '@/types';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const { prompt, chatId, isNewChat } = await req.json();

  // Create a new experimental stream data instance to send custom data
  const data = new experimental_StreamData();

  // Make the request to your agent API
  const response = await fetch("YOUR_AGENT_API_ENDPOINT", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model: "claude-3-7-sonnet-latest",
      chatId,
      isNewChat,
    }),
  });

  if (!response.body) {
    throw new Error("Response body is null");
  }

  // Create a transform stream to convert your chunks to the format Vercel AI expects
  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const decoder = new TextDecoder();
      const text = decoder.decode(chunk);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr) {
            try {
              const agentChunk = JSON.parse(jsonStr) as RunAgentResponseStreamChunk;

              // Handle different chunk types
              if (agentChunk.chunkType === "step") {
                // Send the summary as the main text stream
                controller.enqueue(agentChunk.summary);

                // Send the full chunk as additional data
                data.append({
                  type: "step",
                  actionResult: agentChunk.actionResult,
                  messageId: agentChunk.messageId
                });
              } else if (agentChunk.chunkType === "finalOutput") {
                // Send the final state as additional data
                data.append({
                  type: "finalOutput",
                  state: agentChunk.content.state,
                  result: agentChunk.content.result
                });
              }
            } catch (e) {
              console.error("Failed to parse JSON:", e);
            }
          }
        }
      }
    },
  });

  // Pipe the response through our transform stream
  const transformedStream = response.body.pipeThrough(transformStream);

  // Return the streaming response with additional data
  return new StreamingTextResponse(transformedStream, { data });
} 