import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; pipelineId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const pipelineId = params.pipelineId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(
    `/projects/${projectId}/pipelines/${pipelineId}/versions-info`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );

  return res;
}
