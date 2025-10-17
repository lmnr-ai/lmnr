import { JsonType } from "../common/types";

// Convert AI SDK message format to OpenAI format
export function convertToOpenAIFormat(message: any): any {
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

export interface SpanData {
  provider: string;
  model: string;
  result: any;
  messages: any[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  playgroundId?: string;
  startTime: Date;
  endTime: Date;
  structuredOutput: JsonType;
}

export function createSpanAttributes(spanData: SpanData): Record<string, unknown> {
  const { provider, model, result, messages, maxTokens, temperature, topP, topK, playgroundId, structuredOutput } =
    spanData;

  const openAIMessages = messages.map(convertToOpenAIFormat);

  const attributes: Record<string, unknown> = {
    "gen_ai.system": provider,
    "gen_ai.request.model": model.split(":")[1],
    "gen_ai.response.model": result.response?.modelId || model.split(":")[1],
    "gen_ai.usage.input_tokens": result.usage.promptTokens,
    "gen_ai.usage.output_tokens": result.usage.completionTokens,
    "gen_ai.usage.prompt_tokens": result.usage.promptTokens, // Legacy support
    "gen_ai.usage.completion_tokens": result.usage.completionTokens, // Legacy support
    "gen_ai.request.max_tokens": maxTokens,
    "gen_ai.request.temperature": temperature,
    "gen_ai.request.top_p": topP,
    "gen_ai.request.top_k": topK,
    "gen_ai.response.finish_reasons": [result.finishReason],
    "operation.name": "ai.generateText playground-chat",
    "ai.operationId": "ai.generateText",
    "lmnr.span.type": "LLM",
    "lmnr.association.properties.trace_type": "PLAYGROUND",
    "ai.prompt.messages": JSON.stringify(openAIMessages),
    "lmnr.association.properties.metadata.playgroundId": playgroundId,
    "gen_ai.request.structured_output_schema": JSON.stringify(structuredOutput),
  };

  openAIMessages.forEach((message: any, index: number) => {
    attributes[`gen_ai.prompt.${index}.role`] = message.role;
    if (typeof message.content === "string") {
      attributes[`gen_ai.prompt.${index}.content`] = message.content;
    } else {
      attributes[`gen_ai.prompt.${index}.content`] = JSON.stringify(message.content);
    }
  });

  attributes["gen_ai.completion.0.role"] = "assistant";
  attributes["gen_ai.completion.0.content"] = result.text;

  return attributes;
}

export async function sendSpanData(
  projectId: string,
  provider: string,
  spanData: SpanData,
  attributes: Record<string, unknown>
): Promise<void> {
  try {
    const spanResponse = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/spans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `playground.${provider}.chat`,
        spanType: "LLM",
        startTime: spanData.startTime.toISOString(),
        endTime: spanData.endTime.toISOString(),
        attributes,
      }),
    });

    if (!spanResponse.ok) {
      console.error("Failed to send span data:", await spanResponse.text());
    }
  } catch (error) {
    console.error("Error sending span data:", error);
  }
}
