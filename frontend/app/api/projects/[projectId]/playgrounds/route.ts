import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { playgrounds } from '@/lib/db/migrations/schema';

export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const result = await db.query.playgrounds.findMany({
    where: eq(playgrounds.projectId, projectId),
  });

  return new Response(JSON.stringify(result));
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const body = await req.json();

  const result = await db.insert(playgrounds).values({
    projectId,
    name: body.name,
  })
    .returning();

  if (result.length === 0) {
    return new Response('Failed to create playground', { status: 500 });
  }

  return new Response(JSON.stringify(result[0]));
}
