import { ChatMessageSchema } from '@/lib/actions/trace/agent/messages';
import { streamTraceChat } from '@/lib/actions/trace/agent/stream';
import { prettifyError } from 'zod/v4';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request, props: { params: Promise<{ projectId: string, traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    const { messages, traceStartTime, traceEndTime } = await req.json();

    const parseResult = ChatMessageSchema.safeParse({
      traceId,
      projectId,
      messages,
      traceStartTime,
      traceEndTime,
    });

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const result = await streamTraceChat(parseResult.data);
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Error in chat API:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}