import { z } from 'zod';
import { prettifyError } from 'zod/v4';

import { findOrCreateChatSession,getChatMessages, GetChatMessagesSchema, saveChatMessage } from '@/lib/actions/trace/agent/messages';

export async function GET(req: Request, props: { params: Promise<{ projectId: string, traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    const parseResult = GetChatMessagesSchema.safeParse({
      traceId,
      projectId,
    });

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const result = await getChatMessages(parseResult.data);
    return Response.json(result);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

const SaveMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
    toolCallId: z.string().optional(),
    input: z.any().optional(),
    output: z.any().optional(),
    callProviderMetadata: z.any().optional(),
  })),
  messageId: z.string().optional(),
});

export async function POST(req: Request, props: { params: Promise<{ projectId: string, traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    const body = await req.json();
    const parseResult = SaveMessageSchema.safeParse(body);

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
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
      parts
    });

    return Response.json({ success: true, message: 'Message saved successfully' });
  } catch (error) {
    console.error('Error saving message:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to save message' },
      { status: 500 }
    );
  }
}
