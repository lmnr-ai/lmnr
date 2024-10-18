import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { db } from '@/lib/db/drizzle';
import { labelClassesForPath } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(
  req: Request,
  {
    params
  }: { params: { projectId: string; labelClassId: string; id: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const labelClassId = params.labelClassId;
  const id = params.id;
  const session = await getServerSession(authOptions);
  const user = session!.user;


  const registeredPath = await db.delete(labelClassesForPath).where(eq(labelClassesForPath.id, id));

  if (!registeredPath) {
    return new Response('Registered path not found', { status: 404 });
  }

  return new Response(null, { status: 200 });

  // return await fetcher(
  //   `/projects/${projectId}/label-classes/${labelClassId}/registered-paths/${id}`,
  //   {
  //     method: 'DELETE',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       Authorization: `Bearer ${user.apiKey}`
  //     }
  //   }
  // );
}
