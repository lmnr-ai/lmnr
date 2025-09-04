import { UIMessage } from 'ai';
import { streamTraceChat } from '@/lib/actions/trace/chat/stream';

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const { messages, traceId, traceStartTime, traceEndTime }: { messages: UIMessage[], traceId: string, traceStartTime: string, traceEndTime: string } = await req.json();

  const result = await streamTraceChat({ messages, traceId, traceStartTime, traceEndTime, projectId });

  return result.toUIMessageStreamResponse();
}

