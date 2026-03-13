import { z } from "zod";
import { prettifyError } from "zod/v4";

import {
  findOrCreateChatSession,
  getChatMessages,
  GetChatMessagesSchema,
  saveChatMessage,
} from "@/lib/actions/trace/agent/messages";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; traceId: string }, unknown>(async (_req, params) => {
  const { projectId, traceId } = params;

  const parseResult = GetChatMessagesSchema.safeParse({
    traceId,
    projectId,
  });

  if (!parseResult.success) {
    throw new Error(prettifyError(parseResult.error));
  }

  return await getChatMessages(parseResult.data);
});

const SaveMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  parts: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      toolCallId: z.string().optional(),
      input: z.any().optional(),
      output: z.any().optional(),
      callProviderMetadata: z.any().optional(),
    })
  ),
  messageId: z.string().optional(),
});

export const POST = handleRoute<{ projectId: string; traceId: string }, unknown>(async (req, params) => {
  const { projectId, traceId } = params;

  const body = await req.json();
  const parseResult = SaveMessageSchema.safeParse(body);

  if (!parseResult.success) {
    throw new Error(prettifyError(parseResult.error));
  }

  const { role, parts, messageId } = parseResult.data;

  // Find or create chat session
  const chatId = await findOrCreateChatSession(traceId, projectId);

  // Save the message
  await saveChatMessage({
    chatId,
    traceId,
    projectId,
    role,
    parts,
  });

  return { success: true, message: "Message saved successfully" };
});
