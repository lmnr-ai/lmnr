import { handleChatGeneration, PlaygroundParamsSchema } from "@/lib/actions/chat";

export async function POST(req: Request) {
  try {
    const params = await req.json();

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
