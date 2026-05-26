import { handleChatGeneration } from "@/lib/actions/chat";
import { apiHandler } from "@/lib/api/api-handler";
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

  const result = await handleChatGeneration({
    ...params,
    abortSignal: req.signal,
  });

  return Response.json(result);
});
