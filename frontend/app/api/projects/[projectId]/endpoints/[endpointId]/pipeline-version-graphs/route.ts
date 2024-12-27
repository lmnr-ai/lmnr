import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; endpointId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const endpointId = params.endpointId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(
    `/projects/${projectId}/endpoints/${endpointId}/pipeline-version-graphs`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
}
