import { handleChatGeneration, PlaygroundParamsSchema } from "@/lib/actions/chat";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  try {
    const body = await req.json();
    const { projectId } = await props.params;

    const params = {
      ...body,
      projectId,
    }

    const parseResult = PlaygroundParamsSchema.safeParse(params);

    if (!parseResult.success) {
      return new Response(JSON.stringify(parseResult.error), { status: 400 });
    }

    const result = await handleChatGeneration({
      ...params,
      abortSignal: req.signal,
    });

    return new Response(JSON.stringify(result));
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Internal server error.",
        details: e instanceof Error ? e.name : "Unknown error",
      }),
      {
        status: 500,
      }
    );
  }
}
