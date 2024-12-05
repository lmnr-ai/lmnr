import { type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return new Response(null, { status: 401 });
  }

  const body = await req.json();

  const res = await fetch(`${process.env.BACKEND_URL}/v1/endpoint/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LAMINAR_API_KEY}`
    },
    body: JSON.stringify({
      ...body,
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
      },
      endpoint: 'prompt_copilot'
    })
  });

  return res;
}
