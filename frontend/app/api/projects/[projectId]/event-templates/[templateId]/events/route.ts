import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string, templateId: string } }): Promise<Response> {

  const projectId = params.projectId;
  const templateId = params.templateId;

  const session = await getServerSession(authOptions);
  const user = session!.user;


  const res = await fetcher(`/projects/${projectId}/event-templates/${templateId}/events?${req.nextUrl.searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  });

  return res;
}
