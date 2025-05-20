import { CoreMessage, CoreSystemMessage } from "ai";

import { ImagePart, Message, TextPart, ToolCallPart, ToolResultPart } from "@/lib/playground/types";
import { getS3Object } from "@/lib/s3";
import { ChatMessage, ChatMessageContentPart } from "@/lib/types";

const mapToolMessage = (message: ChatMessage, index: number, messages: ChatMessage[]): Message | null => {
  try {
    const prevMessage = messages[index - 1];

    if (prevMessage?.role === "assistant" && Array.isArray(prevMessage.content)) {
      const toolCall = prevMessage.content.find((part) => part.type === "tool_call");
      if (toolCall?.id && toolCall?.name) {
        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              result: JSON.stringify(message.content),
            },
          ] as Array<ToolResultPart>,
        } as Message;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const mapAssistantMessage = (message: ChatMessage): Message | null => {
  if (!Array.isArray(message.content)) return null;

  const toolCall = message.content.find((part) => part.type === "tool_call");
  if (toolCall) {
    return {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: JSON.stringify(toolCall.arguments),
        },
      ] as Array<ToolCallPart>,
    } as Message;
  }
  return null;
};

const mapContentPart = async (part: ChatMessageContentPart): Promise<ImagePart | TextPart | ToolCallPart> => {
  try {
    if (part.type === "tool_call") {
      return {
        type: "tool-call",
        toolCallId: part.id,
        toolName: part.name,
        args: JSON.stringify(part.arguments), // Stringify args as requested earlier
      } as ToolCallPart;
    }

    if (part.type === "image") {
      return {
        type: "image",
        image: part.data,
      } as ImagePart;
    }

    if (part.type === "image_url" || part.type === "document_url") {
      try {
        if (isStorageUrl(part.url)) {
          const base64Image = await urlToBase64(part.url);
          return {
            type: "image",
            image: base64Image,
          } as ImagePart;
        }
        // If not a storage URL, return the URL directly
        return {
          type: "image",
          image: part.url,
        } as ImagePart;
      } catch (error) {
        console.error("Error processing image URL:", error);
        // Fallback to text if image processing fails
        return {
          type: "text",
          text: `[Image processing failed: ${part.url}]`,
        } as TextPart;
      }
    }

    if (part.type === "text") {
      return {
        type: "text",
        text: part.text,
      } as TextPart;
    }

    return {
      type: "text",
      text: JSON.stringify(part),
    } as TextPart;
  } catch (error) {
    console.error("Error in mapContentPart:", error);
    return {
      type: "text",
      text: `[Error processing content: ${JSON.stringify(part)}]`,
    } as TextPart;
  }
};

export const mapMessages = async (messages: ChatMessage[]): Promise<Message[]> =>
  Promise.all(
    messages.map(async (message, index) => {
      if (typeof message.content === "string") {
        if (message.role === "tool") {
          const toolMessage = mapToolMessage(message, index, messages);
          if (toolMessage) return toolMessage;
        }
        return {
          role: message.role ?? "assistant",
          content: [{ type: "text", text: message.content }] as Array<TextPart>,
        } as Message;
      }

      if (Array.isArray(message.content)) {
        if (message.role === "assistant") {
          const assistantMessage = mapAssistantMessage(message);
          if (assistantMessage) return assistantMessage;
        }

        const content = await Promise.all(message.content.map(mapContentPart));

        return {
          role: message.role ?? "assistant",
          content: content as Array<ImagePart | TextPart | ToolCallPart | ToolResultPart>,
        } as Message;
      }

      return {
        role: message.role ?? "assistant",
        content: [{ type: "text", text: JSON.stringify(message.content) }] as Array<TextPart>,
      } as Message;
    })
  );

export const parseSystemMessages = (messages: Message[]): CoreMessage[] =>
  messages.map((message) => {
    // Handle system messages with text content
    if (message.role === "system" && message.content?.[0]?.type === "text") {
      return {
        role: message.role,
        content: message.content[0].text,
      } as CoreSystemMessage;
    }

    // Handle messages with tool-call content
    if (Array.isArray(message.content)) {
      const parsedContent = message.content.map((part) => {
        if (part.type === "tool-call" && typeof part.args === "string") {
          try {
            return {
              ...part,
              args: JSON.parse(part.args),
            };
          } catch (error) {
            console.error("Error parsing tool-call args:", error);
            return part;
          }
        }
        return part;
      });

      return {
        ...message,
        content: parsedContent,
      } as CoreMessage;
    }

    return message as CoreMessage;
  });

export const urlToBase64 = async (url: string): Promise<string> => {
  try {
    // Validate URL format
    if (!url.startsWith("/api/projects/")) {
      throw new Error("Invalid URL format. Expected URL to start with /api/projects/");
    }

    // Extract projectId and payloadId from URL
    const matches = url.match(/\/api\/projects\/([^\/]+)\/payloads\/([^\/]+)/);
    if (!matches) {
      throw new Error("Invalid URL format");
    }

    const [, projectId, payloadId] = matches;

    // Get the image data directly from S3
    const { bytes, contentType } = await getS3Object(projectId, payloadId);

    // Convert to base64
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    throw new Error(`Failed to convert URL to base64: ${error}`);
  }
};

const isStorageUrl = (url: string) => {
  const storagePattern = /^\/api\/projects\/[^/]+\/payloads\/[^/]+$/;
  return storagePattern.test(url);
};
