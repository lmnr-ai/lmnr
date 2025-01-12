import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const spanId = params.spanId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();
  const res = await fetch(
    `${process.env.BACKEND_URL}/api/v1/projects/${projectId}/spans/${spanId}/export`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      },
      body: JSON.stringify(body)
    }
  );

  return new Response(res.body, { status: res.status });
}
