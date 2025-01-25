import { desc, eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import {
  apiKeys,
  membersOfWorkspaces,
  projects,
  subscriptionTiers,
  workspaces
} from '@/lib/db/migrations/schema';
import { fetcher } from '@/lib/utils';

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = session.user.apiKey;
  const userId = await db
    .select({ id: apiKeys.userId })
    .from(apiKeys)
    .where(eq(apiKeys.apiKey, apiKey))
    .execute()
    .then((res) => res[0].id);

  const results = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
      isFreeTier: sql`${workspaces.tierId} = 1`,
    })
    .from(workspaces)
    .innerJoin(membersOfWorkspaces, eq(workspaces.id, membersOfWorkspaces.workspaceId))
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(membersOfWorkspaces.userId, userId))
    .orderBy(desc(workspaces.createdAt));

  // Fetch projects for each workspace
  const workspacesWithProjects = await Promise.all(
    results.map(async (workspace) => {
      const prjs = await db
        .select({
          id: projects.id,
          name: projects.name,
          workspaceId: projects.workspaceId,
        })
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id));

      return {
        ...workspace,
        projects: prjs,
      };
    })
  );

  return new Response(JSON.stringify(workspacesWithProjects), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();
  const res = await fetcher(`/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });

  return new Response(res.body);
}
