import { handleChatGeneration } from "@/lib/actions/chat";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";
import { parseSystemMessages } from "@/lib/playground/utils";

export const POST = noAudit(
  "trace chat; data reads are audited where the agent's tools run",
  apiHandler<{ projectId: string }>(async (req, ctx) => {
    const body = await req.json();
    const { projectId } = await ctx.params;

    const convertedMessages = body.messages ? parseSystemMessages(body.messages) : [];

    const result = await handleChatGeneration({
      ...body,
      messages: convertedMessages,
      projectId,
      abortSignal: req.signal,
    });

    return Response.json(result);
  })
);
