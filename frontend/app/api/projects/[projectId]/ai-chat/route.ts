import { streamSidePanelChat } from "@/lib/actions/ai-chat/stream";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await req.json();
    const { messages, pageContext } = body;

    const result = await streamSidePanelChat({
      projectId,
      messages,
      pageContext,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error in side panel chat API:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
