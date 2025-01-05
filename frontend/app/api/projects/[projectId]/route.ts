import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/migrations/schema';

export async function PUT(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const { projectId } = params;
  const { name } = await req.json();

  if (!name) {
    return new Response(JSON.stringify({ error: 'Project name is required.' }), {
      status: 400,
    });
  }

  try {
    // Perform the update query
    const result = await db.update(projects).set({ name }).where(eq(projects.id, projectId));

    // Check if any rows were updated
    if (result.count === 0) {
      return new Response(JSON.stringify({ error: 'Project not found.' }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify({ message: 'Project renamed successfully.' }), {
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
    });
  }
}
