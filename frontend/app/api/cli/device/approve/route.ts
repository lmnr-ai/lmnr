import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod/v4";

import { approveDeviceWithProject } from "@/lib/actions/cli-auth";

// Approves a pending device code and writes the chosen projectId into the
// device code `metadata` first (ordering enforced inside approveDeviceWithProject).
const Body = z
  .object({
    userCode: z.string().min(1),
    projectId: z.uuid(),
    // Set by the brand-new-account flow so the user gets the onboarding welcome email.
    sendWelcome: z.boolean().optional(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { userCode, projectId, sendWelcome } = Body.parse(await req.json().catch(() => ({})));
    const result = await approveDeviceWithProject(userCode, projectId, sendWelcome);
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
