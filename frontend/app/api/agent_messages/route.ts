import { type NextRequest } from 'next/server';

import {ChatMessage} from "@/components/chat/types";
import { db } from '@/lib/db/drizzle';
import {agentMessages} from '@/lib/db/migrations/schema';

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json() as ChatMessage;
  await db.insert(agentMessages).values(body);


  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
