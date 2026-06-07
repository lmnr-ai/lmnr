import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, z, ZodError } from "zod/v4";

import { createApiKey } from "@/lib/actions/project-api-keys";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";
import { cliKeyName } from "@/lib/cli-login";
import { mintCode } from "@/lib/cli-login/code";
import { requireSameOrigin } from "@/lib/cli-login/csrf";
import { parseJsonBody } from "@/lib/cli-login/parse-body";
import { db } from "@/lib/db/drizzle";
import { projects } from "@/lib/db/migrations/schema";

const BodySchema = z
  .object({
    projectId: z.guid(),
    codeChallenge: z.string().min(1).optional(),
    manual: z.boolean().optional(),
    hostname: z.string().max(256).optional(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  const originBlocked = requireSameOrigin(req);
  if (originBlocked) return originBlocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;
    const body = BodySchema.parse(parsed.data);

    const isMember = await isUserMemberOfProject(body.projectId, session.user.id);
    if (!isMember) {
      return Response.json({ error: "You do not have access to this project" }, { status: 403 });
    }

    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, body.projectId))
      .limit(1);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // Manual fallback: mint the key now and return it to be displayed once.
    if (body.manual) {
      const apiKey = await createApiKey({
        projectId: body.projectId,
        name: cliKeyName(body.hostname),
        isIngestOnly: false,
      });
      return Response.json({ apiKey: apiKey.value, projectId: body.projectId, projectName: project.name });
    }

    // PKCE mode: mint NO key — return a 60s code bound to the challenge. The
    // CLI redeems it at /api/cli-login/token with the matching verifier.
    if (!body.codeChallenge) {
      return Response.json({ error: "codeChallenge is required" }, { status: 400 });
    }
    const code = await mintCode({
      projectId: body.projectId,
      userId: session.user.id,
      codeChallenge: body.codeChallenge,
    });
    return Response.json({ code, projectId: body.projectId, projectName: project.name });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
