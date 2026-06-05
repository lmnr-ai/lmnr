import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { createProject } from "@/lib/actions/projects";
import { createWorkspaceForUser } from "@/lib/actions/workspaces";
import { isUserMemberOfWorkspace } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { projects } from "@/lib/db/migrations/schema";
import { resolveCaller } from "@/lib/oauth/resolve-caller";
import { listAccessibleWorkspaces } from "@/lib/oauth/user-access";

const BodySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  workspaceName: z.string().min(1).max(255).optional(),
  projectName: z.string().min(1).max(255),
});

export async function POST(req: NextRequest): Promise<Response> {
  const caller = await resolveCaller(req);
  if (!caller) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    // Resolve workspace: explicit flag → 0/1/N branching off listAccessibleWorkspaces.
    let workspaceId: string;
    let workspaceName: string;
    let workspaceCreated = false;

    if (body.workspaceId) {
      const member = await isUserMemberOfWorkspace(body.workspaceId, caller.userId);
      if (!member) {
        return Response.json({ error: "workspace_forbidden" }, { status: 403 });
      }
      const accessible = await listAccessibleWorkspaces(caller.userId);
      const found = accessible.find((w) => w.id === body.workspaceId);
      if (!found) {
        return Response.json({ error: "workspace_forbidden" }, { status: 403 });
      }
      workspaceId = found.id;
      workspaceName = found.name;
    } else {
      const accessible = await listAccessibleWorkspaces(caller.userId);
      if (accessible.length === 0) {
        // Create workspace without an initial project so the dedicated
        // project-create step below stays idempotent on retry.
        const created = await createWorkspaceForUser({
          userId: caller.userId,
          userEmail: caller.email,
          name: body.workspaceName ?? "My Workspace",
        });
        workspaceId = created.id;
        workspaceName = created.name;
        workspaceCreated = true;
      } else if (accessible.length === 1) {
        workspaceId = accessible[0].id;
        workspaceName = accessible[0].name;
      } else {
        // Ambiguous — defer to the client to pick.
        return Response.json(
          {
            error: "workspace_ambiguous",
            workspaces: accessible.map((w) => ({ id: w.id, name: w.name })),
          },
          { status: 400 }
        );
      }
    }

    // Resolve project — reuse same-named project in the workspace if it
    // exists (idempotency), otherwise create it.
    let projectId: string;
    let projectName: string;
    let projectCreated = false;

    const existing = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.name, body.projectName)))
      .limit(1);

    if (existing.length > 0) {
      projectId = existing[0].id;
      projectName = existing[0].name;
    } else {
      const project = await createProject({
        name: body.projectName,
        workspaceId,
        subscriberEmail: caller.email ?? undefined,
      });
      projectId = project.id;
      projectName = project.name;
      projectCreated = true;
    }

    return Response.json({
      workspaceId,
      workspaceName,
      workspaceCreated,
      projectId,
      projectName,
      projectCreated,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
