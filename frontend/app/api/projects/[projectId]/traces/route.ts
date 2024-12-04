import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const projectId = params.projectId;

  return await fetcher(
    `/projects/${projectId}/traces?${req.nextUrl.searchParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
}
