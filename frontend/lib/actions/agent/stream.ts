import { google } from "@ai-sdk/google";
import { convertToModelMessages, smoothStream, streamText, type UIMessage } from "ai";
import { z } from "zod";

import { LaminarAgentPrompt } from "./prompt";

export const AgentStreamChatSchema = z.object({
  messages: z.array(z.any()).describe("Array of UI messages"),
  projectId: z.string().describe("The project ID"),
});

export const streamAgentChat = async (input: z.infer<typeof AgentStreamChatSchema>) => {
  const { messages: uiMessages } = input;

  const result = streamText({
    model: google("gemini-2.5-flash"),
    messages: convertToModelMessages(uiMessages as UIMessage[]),
    maxRetries: 5,
    system: LaminarAgentPrompt,
    experimental_transform: smoothStream(),
  });

  return result;
};
