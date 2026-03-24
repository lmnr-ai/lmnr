import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, z, ZodError } from "zod/v4";

import { generateSpanMapping } from "@/lib/actions/trace/diff";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";

const DiffRequestSchema = z.object({
  leftTraceId: z.string(),
  rightTraceId: z.string(),
});

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await props.params;

  if (!(await isUserMemberOfProject(projectId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = DiffRequestSchema.parse(await req.json());
    const mapping = await generateSpanMapping(projectId, body.leftTraceId, body.rightTraceId);
    return NextResponse.json(mapping);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate span mapping." },
      { status: 500 }
    );
  }
}
