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

    return message as CoreMessage;
  });
