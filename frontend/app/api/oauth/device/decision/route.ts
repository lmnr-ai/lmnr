import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, z, ZodError } from "zod/v4";

import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";
import { approveDeviceCode, denyDeviceCode, getDeviceCodeByUserCode } from "@/lib/oauth/device-codes";

const BodySchema = z.object({
  user_code: z.string().min(1),
  decision: z.enum(["approve", "deny"]),
  project_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { user_code, decision, project_id } = BodySchema.parse(body);

    const normalized = user_code.trim().toUpperCase();
    const row = await getDeviceCodeByUserCode(normalized);
    if (!row) {
      return Response.json({ error: "Code not found" }, { status: 404 });
    }
    if (row.status !== "pending") {
      return Response.json({ error: `Code is ${row.status}` }, { status: 409 });
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      return Response.json({ error: "Code expired" }, { status: 410 });
    }

    if (decision === "deny") {
      const ok = await denyDeviceCode(normalized);
      if (!ok) {
        return Response.json({ error: "Could not deny" }, { status: 409 });
      }
      return Response.json({ ok: true });
    }

    if (!project_id) {
      return Response.json({ error: "project_id is required to approve" }, { status: 400 });
    }
    const member = await isUserMemberOfProject(project_id, session.user.id);
    if (!member) {
      return Response.json({ error: "You don't have access to that project" }, { status: 403 });
    }

    const ok = await approveDeviceCode(normalized, session.user.id, project_id);
    if (!ok) {
      return Response.json({ error: "Could not approve" }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
