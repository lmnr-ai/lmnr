import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; labelClassId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const labelClassId = params.labelClassId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  return await fetcher(
    `/projects/${projectId}/label-classes/${labelClassId}/registered-paths`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      },
      body: JSON.stringify(body)
    }
  );
}
