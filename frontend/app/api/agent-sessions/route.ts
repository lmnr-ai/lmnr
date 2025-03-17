import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { agentSessions, users } from "@/lib/db/migrations/schema";

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
    where: eq(agentSessions.userId, result.id),
    columns: {
      chatId: true,
      updatedAt: true,
      chatName: true,
    },
    orderBy: asc(agentSessions.createdAt),
  });

  return new Response(JSON.stringify(data));
}
