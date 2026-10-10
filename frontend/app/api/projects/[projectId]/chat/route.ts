import { handleChatGeneration } from "@/lib/actions/chat";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/errors";
import { parseSystemMessages } from "@/lib/playground/utils";

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const body = await req.json();
  const { projectId } = await ctx.params;

  const convertedMessages = body.messages ? parseSystemMessages(body.messages) : [];

  const params = {
    ...body,
    messages: convertedMessages,
    projectId,
  };

  try {
    const result = await handleChatGeneration({
      ...params,
      abortSignal: req.signal,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
});
