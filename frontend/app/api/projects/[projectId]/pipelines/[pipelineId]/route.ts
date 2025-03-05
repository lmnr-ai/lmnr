import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; pipelineId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const pipelineId = params.pipelineId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/projects/${projectId}/pipelines/${pipelineId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  return new Response(res.body);
}

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; pipelineId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const pipelineId = params.pipelineId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/projects/${projectId}/pipelines/${pipelineId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  return new Response(res.body);
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; pipelineId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const pipelineId = params.pipelineId;
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const body = await req.json();

  const res = await fetcher(`/projects/${projectId}/pipelines/${pipelineId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });

  return new Response(res.body);
}
