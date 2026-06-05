import { type NextRequest } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { createApiKey } from "@/lib/actions/project-api-keys";
import { isUserMemberOfProject } from "@/lib/authorization";
import { resolveCaller } from "@/lib/oauth/resolve-caller";

const BodySchema = z.object({
  name: z.string().min(1).max(255).optional().nullable(),
  isIngestOnly: z.boolean().optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const caller = await resolveCaller(req);
  if (!caller) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { projectId } = await props.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) {
    return Response.json({ error: "invalid_project_id" }, { status: 400 });
  }

  const member = await isUserMemberOfProject(projectId, caller.userId);
  if (!member) {
    return Response.json({ error: "project_forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json().catch(() => ({})));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const apiKey = await createApiKey({
      projectId,
      name: body.name ?? null,
      isIngestOnly: body.isIngestOnly ?? false,
    });
    return Response.json(apiKey);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
