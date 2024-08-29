import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { workspaceId: string } }): Promise<Response> {
  const workspaceId = params.workspaceId;
  const session = await getServerSession(authOptions)
  const user = session!.user

  return await fetcher(`/limits/workspace/${workspaceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}
