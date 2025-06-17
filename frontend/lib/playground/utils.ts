import { CoreMessage, CoreSystemMessage } from "ai";

import { Message } from "@/lib/playground/types";

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
