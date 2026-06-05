import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";

export interface AccessibleProject {
  id: string;
  name: string;
}

export interface AccessibleWorkspace {
  id: string;
  name: string;
  projects: AccessibleProject[];
}

/**
 * Returns every workspace + project the user has access to, used to render
 * the OAuth approval page picker.
 */
export async function listAccessibleWorkspaces(userId: string): Promise<AccessibleWorkspace[]> {
  const rows = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(workspaces)
    .innerJoin(membersOfWorkspaces, eq(workspaces.id, membersOfWorkspaces.workspaceId))
    .leftJoin(projects, eq(projects.workspaceId, workspaces.id))
    .where(eq(membersOfWorkspaces.userId, userId))
    .orderBy(asc(workspaces.name), asc(projects.name));

  const byWorkspace = new Map<string, AccessibleWorkspace>();
  for (const r of rows) {
    let ws = byWorkspace.get(r.workspaceId);
    if (!ws) {
      ws = { id: r.workspaceId, name: r.workspaceName, projects: [] };
      byWorkspace.set(r.workspaceId, ws);
    }
    if (r.projectId && r.projectName) {
      ws.projects.push({ id: r.projectId, name: r.projectName });
    }
  }
  return Array.from(byWorkspace.values());
}
