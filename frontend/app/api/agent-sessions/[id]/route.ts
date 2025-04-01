import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { agentChats, agentSessions } from "@/lib/db/migrations/schema";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const id = params.id;

  const data = await db.query.agentSessions.findFirst({
    where: eq(agentSessions.sessionId, id),
    with: {
      agentChats: true,
    },
    columns: {
      vncUrl: true,
    },
  });

  if (data) {
    // Flatten the data to the AgentSession type
    const flattenedData = {
      vncUrl: data.vncUrl,
      sessionId: data.agentChats[0].sessionId,
      chatName: data.agentChats[0].chatName,
      machineStatus: data.agentChats[0].machineStatus,
      userId: data.agentChats[0].userId,
    };

    return new Response(JSON.stringify(flattenedData));
  }

  return new Response(JSON.stringify({ vncUrl: null }));
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const id = params.id;

  const body = (await req.json()) as { name: string };

  try {
    await db
      .update(agentChats)
      .set({
        chatName: body.name,
      })
      .where(eq(agentChats.sessionId, id));

    return new Response(JSON.stringify("Chat updated successfully."));
  } catch (e) {
    return new Response(JSON.stringify({ message: "Error updating chat." }));
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const id = params.id;

  try {
    await db.delete(agentSessions).where(eq(agentSessions.sessionId, id));
    return new Response(JSON.stringify("Chat deleted successfully."));
  } catch (e) {
    return new Response(JSON.stringify({ message: "Error deleting chat." }));
  }
}
