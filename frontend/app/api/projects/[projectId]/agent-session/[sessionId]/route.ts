import { NextRequest } from 'next/server';
import { agentSessions } from '@/lib/db/migrations/schema';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const sessionId = params.sessionId;
  try {

    const session = await db.query.agentSessions.findFirst({
      where: eq(agentSessions.sessionId, sessionId),
    });

    return new Response(JSON.stringify(session), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error getting agent session:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}