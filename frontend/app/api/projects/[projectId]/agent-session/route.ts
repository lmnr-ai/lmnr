import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; traceId: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  try {
    const response = await fetch(
      `${process.env.BACKEND_URL}/api/v1/projects/${params.projectId}/traces/${params.traceId}/agent-session`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${user.apiKey}`
        }
      }
    );

    const data = await response.json();
    return new Response(JSON.stringify(data), {
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; traceId: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  try {
    const response = await fetch(
      `${process.env.BACKEND_URL}/api/v1/projects/${params.projectId}/agent-session/stop`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${user.apiKey}`
        }
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