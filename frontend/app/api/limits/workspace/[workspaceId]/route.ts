import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function GET(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const workspaceId = params.workspaceId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(`/limits/workspace/${workspaceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    }
  });
}
