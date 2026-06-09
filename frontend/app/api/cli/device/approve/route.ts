import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod/v4";

import { approveDeviceWithProject } from "@/lib/actions/cli-auth";

// Approves a pending device code and writes the chosen projectId into the
// device code `scope` first (ordering enforced inside approveDeviceWithProject).
const Body = z
  .object({
    userCode: z.string().min(1),
    projectId: z.uuid(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { userCode, projectId } = Body.parse(await req.json().catch(() => ({})));
    const result = await approveDeviceWithProject(userCode, projectId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
