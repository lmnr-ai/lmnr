import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { LabelSource } from '@/lib/traces/types';
import { db } from '@/lib/db/drizzle';
import { eq } from 'drizzle-orm';
import { labelClasses } from '@/lib/db/migrations/schema';
import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const spanId = params.spanId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(`/projects/${projectId}/spans/${spanId}/labels`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    }
  });
}

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

  if (body.scoreName) {
    body.scoreName = body.scoreName.trim() + (user.name ? ` (${user.name})` : '');
  }

  body.userEmail = user.email;

  return await fetcher(`/projects/${projectId}/spans/${spanId}/labels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });
}
