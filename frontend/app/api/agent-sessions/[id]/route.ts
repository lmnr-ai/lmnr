import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { agentSessions } from "@/lib/db/migrations/schema";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const id = params.id;

  const data = await db.query.agentSessions.findFirst({
    where: eq(agentSessions.sessionId, id),
    columns: {
      vncUrl: true,
      machineStatus: true,
    },
  });

  if (data) {
    return new Response(JSON.stringify({ ...data, vncUrl: data?.vncUrl || null }));
  }

  return new Response(JSON.stringify({ vncUrl: null }));
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const id = params.id;

  const body = (await req.json()) as { name: string };

  try {
    await db
      .update(agentSessions)
      .set({
        chatName: body.name,
      })
      .where(eq(agentSessions.sessionId, id));

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
