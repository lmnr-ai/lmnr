import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/migrations/schema';
import { fetcher } from '@/lib/utils';

const updateProjectSchema = z.object({
  name: z.string()
});

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  return fetcher(`/projects/${projectId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });
}

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const body = await req.json();

  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    console.log(parsed.error.errors);
    return new Response(JSON.stringify({ error: parsed.error.errors }), {
      status: 400
    });
  }
  const projectId = params.projectId;

  const res = await db
    .update(projects)
    .set({
      name: parsed.data.name
    })
    .where(eq(projects.id, projectId))
    .returning();

  return new Response(JSON.stringify(res));
}
