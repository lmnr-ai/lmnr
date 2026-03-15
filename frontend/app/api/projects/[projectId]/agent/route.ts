import { AgentStreamChatSchema, streamAgentChat } from "@/lib/actions/agent/stream";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const { messages } = await req.json();

    const parseResult = AgentStreamChatSchema.safeParse({
      projectId,
      messages,
    });

    if (!parseResult.success) {
      return Response.json({ error: parseResult.error.message }, { status: 400 });
    }

    const result = await streamAgentChat(parseResult.data);
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error in agent chat API:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
