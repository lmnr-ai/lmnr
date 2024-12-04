import { type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { isCurrentUserMemberOfWorkspace } from '@/lib/db/utils';
import { fetcher } from '@/lib/utils';

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  if (!isCurrentUserMemberOfWorkspace(body.workspaceId)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  return await fetcher(`/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });
}
