import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { agentSessions } from "@/lib/db/migrations/schema";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const id = params.id;

  const data = await db.query.agentSessions.findFirst({
    where: eq(agentSessions.chatId, id),
    columns: {
      vncUrl: true,
      status: true,
    },
  });

  if (data) {
    return new Response(JSON.stringify({ ...data, vncUrl: data?.vncUrl || null }));
  }

  return new Response(JSON.stringify({ vncUrl: null }));
}
