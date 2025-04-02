import { asc, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { ChatMessage } from "@/components/chat/types";
import { db } from "@/lib/db/drizzle";
import { agentMessages } from "@/lib/db/migrations/schema";

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as ChatMessage;
  await db.insert(agentMessages).values(body);

  return new Response(JSON.stringify({ ok: true }));
}

export async function GET(req: NextRequest): Promise<Response> {
  const { sessionId } = (await req.json()) as { sessionId: string };

  const messages = await db.query.agentMessages.findMany({
    where: eq(agentMessages.sessionId, sessionId),
    orderBy: asc(agentMessages.createdAt),
  });

  return new Response(JSON.stringify(messages));
}
