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

// Convert AI SDK message format to OpenAI format
function convertToOpenAIFormat(message: any): any {
  const openAIMessage: any = {
    role: message.role,
  };

  // Handle different content types
  if (typeof message.content === "string") {
    // Simple text content
    openAIMessage.content = message.content;
  } else if (Array.isArray(message.content)) {
    // Multi-part content (text + images, etc.)
    openAIMessage.content = message.content.map((part: any) => {
      if (part.type === "text") {
        return {
          type: "text",
          text: part.text,
        };
      } else if (part.type === "image") {
        // Convert AI SDK image format to OpenAI format
        if (part.image) {
          // Handle base64 data URLs
          if (typeof part.image === "string" && part.image.startsWith("data:")) {
            return {
              type: "image_url",
              image_url: {
                url: part.image,
              },
            };
          }
          // Handle URL images
          else if (typeof part.image === "string") {
            return {
              type: "image_url",
              image_url: {
                url: part.image,
              },
            };
          }
          // Handle buffer/uint8array images (convert to base64)
          else if (part.image instanceof Uint8Array || Buffer.isBuffer(part.image)) {
            const base64 = Buffer.from(part.image).toString("base64");
            const mimeType = part.mimeType || "image/jpeg";
            return {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            };
          }
        }
        return part; // Fallback to original format
      } else if (part.type === "tool-call") {
        // Handle tool calls
        return {
          type: "tool_call",
          id: part.toolCallId,
          function: {
            name: part.toolName,
            arguments: JSON.stringify(part.args || {}),
          },
        };
      } else if (part.type === "tool-result") {
        // Handle tool results
        return {
          type: "tool_result",
          tool_call_id: part.toolCallId,
          content: part.result,
        };
      }

      return part; // Fallback for unknown types
    });
  } else {
    // Fallback to original content
    openAIMessage.content = message.content;
  }

  // Handle tool calls at message level (for assistant messages)
  if (message.toolInvocations && Array.isArray(message.toolInvocations)) {
    openAIMessage.tool_calls = message.toolInvocations.map((invocation: any) => ({
      id: invocation.toolCallId,
      type: "function",
      function: {
        name: invocation.toolName,
        arguments: JSON.stringify(invocation.args || {}),
      },
    }));
  }

  return openAIMessage;
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      model,
      projectId,
      providerOptions,
      maxTokens,
      temperature,
      topP,
      topK,
      tools,
      toolChoice,
      playgroundId,
    } = await req.json();

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
      abortSignal: req.signal,
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

          // Convert AI SDK messages to OpenAI format
          const openAIMessages = messages.map(convertToOpenAIFormat);

          // Create span attributes following OpenTelemetry conventions
          const attributes: Record<string, unknown> = {
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
            "lmnr.association.properties.trace_type": "PLAYGROUND",
            "ai.prompt.messages": JSON.stringify(openAIMessages),
            "lmnr.association.properties.metadata.playgroundId": playgroundId,
          };

          // Store messages in OpenAI format for better compatibility
          openAIMessages.forEach((message: any, index: number) => {
            attributes[`gen_ai.prompt.${index}.role`] = message.role;
            if (typeof message.content === "string") {
              attributes[`gen_ai.prompt.${index}.content`] = message.content;
            } else {
              attributes[`gen_ai.prompt.${index}.content`] = JSON.stringify(message.content);
            }
          });

          attributes["gen_ai.completion.0.role"] = "assistant";
          attributes["gen_ai.completion.0.content"] = text;

          // Send span data to our new endpoint
          const spanResponse = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/spans`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: `playground.${provider}.chat`,
              spanType: "LLM",
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              attributes,
            }),
          });

          if (!spanResponse.ok) {
            console.error("Failed to send span data:", await spanResponse.text());
          }
        } catch (error) {
          console.error("Error sending span data:", error);
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
