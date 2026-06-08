import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod/v4";

import { loadDeviceContext, setDeviceProjectSelection } from "@/lib/actions/device";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";

const Body = z.object({
  userCode: z.string().min(1).max(64),
  projectId: z.uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { userCode, projectId } = Body.parse(await req.json());

    const member = await isUserMemberOfProject(projectId, session.user.id);
    if (!member) {
      return NextResponse.json({ error: "You do not have access to this project" }, { status: 403 });
    }

    const ctx = await loadDeviceContext(userCode);
    if (!ctx) {
      return NextResponse.json({ error: "Unknown device code" }, { status: 404 });
    }

    const ok = await setDeviceProjectSelection({
      userCode,
      projectId,
      userId: session.user.id,
      baseScope: ctx.scope,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Could not record selection (code expired, denied, or not yours)" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
