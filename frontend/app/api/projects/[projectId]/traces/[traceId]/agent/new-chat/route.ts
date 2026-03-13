import { handleRoute } from "@/lib/api/route-handler";
import { db } from "@/lib/db/drizzle";
import { tracesAgentChats } from "@/lib/db/migrations/schema";

export const POST = handleRoute<{ projectId: string; traceId: string }, unknown>(async (_req, params) => {
  const { projectId, traceId } = params;

  // Create a new chat session in the database
  const newChat = await db
    .insert(tracesAgentChats)
    .values({
      traceId: traceId,
      projectId: projectId,
    })
    .returning();

  return {
    success: true,
    chatId: newChat[0].id,
    message: "New chat session created successfully",
  };
});
