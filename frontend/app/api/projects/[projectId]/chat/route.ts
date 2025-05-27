import { getErrorMessage } from "@ai-sdk/provider";
import { coreMessageSchema, streamText } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { Provider, providerToApiKey } from "@/components/playground/types";
import { parseTools } from "@/components/playground/utils";
import { decodeApiKey } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { providerApiKeys } from "@/lib/db/migrations/schema";
import { getModel } from "@/lib/playground/providersRegistry";

export async function POST(req: Request) {
  try {
    const { messages, model, projectId, providerOptions, maxTokens, temperature, topP, topK, tools, toolChoice, playgroundId } =
      await req.json();

    const parseResult = z.array(coreMessageSchema).min(1).safeParse(messages);

    const parsedTools = parseTools(tools);

    if (!parseResult.success) {
      throw new Error(`Messages doesn't match structure: ${parseResult.error}`);
    }

    const provider = model.split(":")[0] as Provider;

    const apiKeyName = providerToApiKey[provider];

    const [key] = await db
      .select({
        value: providerApiKeys.value,
        nonceHex: providerApiKeys.nonceHex,
        name: providerApiKeys.name,
        createdAt: providerApiKeys.createdAt,
      })
      .from(providerApiKeys)
      .where(and(eq(providerApiKeys.projectId, projectId), eq(providerApiKeys.name, apiKeyName)));

    if (!key) {
      throw new Error("No matching key found.");
    }

    const decodedKey = await decodeApiKey(key.name, key.nonceHex, key.value);

    const startTime = new Date();

    const result = streamText({
      model: getModel(model, decodedKey),
      messages,
      maxTokens,
      temperature,
      topK,
      topP,
      providerOptions,
      tools: parsedTools,
      toolChoice,
      onFinish: async ({ finishReason, usage, text, response }) => {
        try {
          const endTime = new Date();

          // Create span attributes following OpenTelemetry conventions
          const attributes = {
            "gen_ai.system": provider,
            "gen_ai.request.model": model.split(":")[1],
            "gen_ai.response.model": response?.modelId || model.split(":")[1],
            "gen_ai.usage.input_tokens": usage.promptTokens,
            "gen_ai.usage.output_tokens": usage.completionTokens,
            "gen_ai.usage.prompt_tokens": usage.promptTokens, // Legacy support
            "gen_ai.usage.completion_tokens": usage.completionTokens, // Legacy support
            "gen_ai.request.max_tokens": maxTokens,
            "gen_ai.request.temperature": temperature,
            "gen_ai.request.top_p": topP,
            "gen_ai.request.top_k": topK,
            "gen_ai.response.finish_reasons": [finishReason],
            "operation.name": "ai.streamText playground-chat",
            "ai.operationId": "ai.streamText",
            "lmnr.span.type": "LLM",
            "lmnr.association.properties.metadata.playgroundId": playgroundId,
          };

          // Send span data to our new endpoint
          const spanResponse = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/spans`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: `playground.${provider}.chat`,
              spanType: "LLM",
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              input: messages,
              output: [
                {
                  role: "assistant",
                  content: text,
                },
              ],
              attributes
            }),
          });

          if (!spanResponse.ok) {
            console.error('Failed to send span data:', await spanResponse.text());
          }
        } catch (error) {
          console.error('Error sending span data:', error);
        }
      },
    });

    return result.toDataStreamResponse({
      sendReasoning: true,
      getErrorMessage,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Internal server error.",
        details: e instanceof Error ? e.name : "Unknown error",
      }),
      {
        status: 500,
      }
    );
  }
}
