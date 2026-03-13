import { handleChatGeneration } from "@/lib/actions/chat";
import { handleRoute } from "@/lib/api/route-handler";
import { parseSystemMessages } from "@/lib/playground/utils";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const body = await req.json();

  const convertedMessages = body.messages ? parseSystemMessages(body.messages) : [];

  const chatParams = {
    ...body,
    messages: convertedMessages,
    projectId,
  };

  return await handleChatGeneration({
    ...chatParams,
    abortSignal: req.signal,
  });
});
