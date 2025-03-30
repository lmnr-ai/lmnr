import { NextRequest } from 'next/server';
import { fetcher } from '@/lib/utils';

export async function POST(
  request: NextRequest,
) {
  const body = await request.json();
  const sessionId = body.sessionId;

  try {
    const response = await fetcher(
      `/agent/stop`,
      {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }
    );

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error canceling agent session:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 