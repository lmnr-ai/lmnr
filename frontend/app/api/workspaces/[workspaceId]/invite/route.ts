import { and, count, eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { apiKeys, membersOfWorkspaces, workspaces } from '@/lib/db/migrations/schema';
import { isCurrentUserMemberOfWorkspace } from '@/lib/db/utils';
import { sendInvitationEmail } from '@/lib/emails/utils';

export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!(await isCurrentUserMemberOfWorkspace(params.workspaceId))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // check if user owner of workspace
  const isOwner = await db.select({ count: count() })
    .from(membersOfWorkspaces)
    .innerJoin(apiKeys, eq(membersOfWorkspaces.userId, apiKeys.userId))
    .where(and(
      eq(membersOfWorkspaces.workspaceId, params.workspaceId),
      eq(apiKeys.apiKey, user.apiKey),
      eq(membersOfWorkspaces.memberRole, 'owner')
    ));


  if (isOwner[0].count === 0) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await req.json();

  const email = body.email;
  const workspaceId = params.workspaceId;

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId)
  });

  if (!workspace) {
    return new Response(JSON.stringify({ error: 'Workspace not found' }), { status: 404 });
  }

  // count members of workspace
  const membersOfWorkspace = await db.select({ count: count() })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.workspaceId, workspaceId));

  if (membersOfWorkspace[0].count === workspace.additionalSeats + 1) {
    return new Response(JSON.stringify({ error: 'Workspace is full' }), { status: 400 });
  }

  const token = jwt.sign({
    email,
    workspaceId
  }, process.env.NEXTAUTH_SECRET!, { expiresIn: '48h' });

  const link = `${process.env.NEXTAUTH_URL}/invitations?token=${token}`;

  await sendInvitationEmail(email, workspace.name, link);

  return Response.json({ success: true });

}
