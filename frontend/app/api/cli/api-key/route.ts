import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod/v4";

import { createApiKey } from "@/lib/actions/project-api-keys";
import { auth } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";

const Body = z
  .object({
    projectId: z.uuid().optional(),
    deviceName: z.string().max(120).optional(),
  })
  .strict();

// Mints a project API key for the session-bearer user. `lmnr-cli setup` is the
// caller today (it writes LMNR_PROJECT_API_KEY into ./.env after login), but the
// endpoint is intentionally generic — not bound to the setup flow. Auth comes
// from a BetterAuth session token via the bearer() plugin. CLI-minted keys have
// no expiration. The minting user is recorded for auditing.
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId, deviceName } = Body.parse(await req.json().catch(() => ({})));

    const keyName = `lmnr-cli setup (${deviceName?.trim() || "cli"})`.slice(0, 200);

    if (projectId) {
      // Fresh membership check (no cache) — minting a key is security-sensitive
      // and a since-removed user must not pass on a stale 30-day cached `true`.
      const member = await isUserMemberOfProject(projectId, userId, { skipCache: true });
      if (!member) {
        return NextResponse.json({ error: "You do not have access to this project" }, { status: 403 });
      }
      const [project] = await db
        .select({
          id: projects.id,
          name: projects.name,
          workspaceId: projects.workspaceId,
          workspaceName: workspaces.name,
        })
        .from(projects)
        .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      const key = await createApiKey({
        projectId: project.id,
        name: keyName,
        isIngestOnly: false,
        userId,
        expiresAt: null,
      });
      return NextResponse.json({
        apiKey: key.value,
        apiKeyId: key.id,
        projectId: project.id,
        projectName: project.name,
        workspaceId: project.workspaceId,
        workspaceName: project.workspaceName,
      });
    }

    const userProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
      })
      .from(projects)
      .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .innerJoin(membersOfWorkspaces, and(eq(membersOfWorkspaces.workspaceId, workspaces.id)))
      .where(eq(membersOfWorkspaces.userId, userId))
      .orderBy(asc(workspaces.name), asc(projects.name));

    if (userProjects.length === 0) {
      return NextResponse.json({ error: "no_projects" }, { status: 400 });
    }
    if (userProjects.length > 1) {
      return NextResponse.json(
        {
          error: "project_ambiguous",
          projects: userProjects.map((p) => ({ id: p.id, name: p.name, workspaceName: p.workspaceName })),
        },
        { status: 400 }
      );
    }

    const project = userProjects[0];
    const key = await createApiKey({
      projectId: project.id,
      name: keyName,
      isIngestOnly: false,
      userId,
      expiresAt: null,
    });
    return NextResponse.json({
      apiKey: key.value,
      apiKeyId: key.id,
      projectId: project.id,
      projectName: project.name,
      workspaceId: project.workspaceId,
      workspaceName: project.workspaceName,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    // Don't leak internal error details (DB errors can carry schema/connection
    // info) to API clients — log server-side, return a generic message.
    console.error("cli api-key error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
