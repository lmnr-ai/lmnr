import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { AgentSession } from "@/components/chat/types";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { agentChats, agentSessions, users } from "@/lib/db/migrations/schema";

export async function GET(_req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = session.user;

  const result = await db.query.users.findFirst({
    where: eq(users.email, String(user.email)),
    columns: {
      id: true,
    },
  });

  if (!result) {
    return new Response(JSON.stringify({ error: "Failed to find user." }), { status: 500 });
  }

  const data = await db.query.agentSessions.findMany({
    with: {
      agentChats: {
        where: eq(agentChats.userId, result.id),
      },
    },
    columns: {
      sessionId: true,
      updatedAt: true,
    },
    orderBy: desc(agentSessions.updatedAt),
  });

  // Flatten the data to the AgentSession type
  const flattenedData = data.flatMap((session) => (
    session.agentChats.map((chat) => ({
      sessionId: session.sessionId,
      updatedAt: session.updatedAt,
      chatName: chat.chatName,
      machineStatus: chat.machineStatus,
      userId: chat.userId,
    }))
  ));

  return new Response(JSON.stringify(flattenedData));
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as { chatName: string; sessionId: string; userId: string };

  await db.insert(agentSessions).values({ sessionId: body.sessionId });
  await db.insert(agentChats).values(body);

  return new Response(JSON.stringify({ ok: true }));
}
