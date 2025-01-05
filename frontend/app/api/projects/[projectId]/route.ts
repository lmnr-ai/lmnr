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
    console.log(typeof result);
    console.log('Result:', result);

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
    console.error('Error renaming project:', error);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
    });
  }
}

// import { getServerSession } from 'next-auth';

// import { authOptions } from '@/lib/auth';
// import { fetcher } from '@/lib/utils';

// export async function DELETE(
//   req: Request,
//   { params }: { params: { projectId: string } }
// ): Promise<Response> {
//   const projectId = params.projectId;

//   const session = await getServerSession(authOptions);
//   const user = session!.user;

//   return fetcher(`/projects/${projectId}`, {
//     method: 'DELETE',
//     headers: {
//       Authorization: `Bearer ${user.apiKey}`
//     }
//   });
// }
