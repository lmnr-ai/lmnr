import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { agentSessions } from "@/lib/db/migrations/schema";

export async function GET(req: NextRequest): Promise<Response> {
  const chatId = req.nextUrl.searchParams.get("chatId");

  if (chatId) {
    const data = await db.query.agentSessions.findFirst({
      where: eq(agentSessions.chatId, chatId),
      columns: {
        vncUrl: true,
        status: true,
      },
    });

    if (data) {
      return new Response(JSON.stringify({ ...data, vncUrl: data?.vncUrl || null }), { status: 200 });
    }
  }

  return new Response(JSON.stringify({ vncUrl: null }), { status: 200 });
}
